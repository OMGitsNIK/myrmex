/**
 * Create a test policy on devnet to validate the full end-to-end flow.
 * Uses crop_drought pool with oracle_authority as trigger oracle.
 */

import * as anchor from "@coral-xyz/anchor";
import {
  createAssociatedTokenAccountIdempotent,
  getAssociatedTokenAddress,
  mintTo,
} from "@solana/spl-token";
import * as fs from "fs";
import * as path from "path";
import { createHash } from "crypto";

const PROGRAM_ID = new anchor.web3.PublicKey(
  "9naJhrt9FdAHLwdLnQfgx6citNgEWmW8aLovCS9kYpan"
);

// Crop pool pubkey from setup-pool-configs output
const CROP_POOL = new anchor.web3.PublicKey(
  "HfyGsQVVsxt6BNM7UzTepBo91DKYdqLy7RKuLrwnM1YY"
);

async function main() {
  const adminPath = path.join(
    process.env.HOME || "~",
    ".config/solana/id.json"
  );
  const oraclePath = path.join(
    process.env.HOME || "~",
    ".config/solana/oracle.json"
  );

  const admin = anchor.web3.Keypair.fromSecretKey(
    Buffer.from(JSON.parse(fs.readFileSync(adminPath, "utf-8")))
  );
  const oracleKp = anchor.web3.Keypair.fromSecretKey(
    Buffer.from(JSON.parse(fs.readFileSync(oraclePath, "utf-8")))
  );

  const connection = new anchor.web3.Connection(
    "https://api.devnet.solana.com",
    "confirmed"
  );
  const wallet = new anchor.Wallet(admin);
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);

  const idl = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "../target/idl/myrmex.json"),
      "utf-8"
    )
  );
  const program = new anchor.Program(idl, provider);

  // Fetch pool to get vault + usdcMint
  const poolAccount = (await (program as any).account.riskPool.fetch(
    CROP_POOL
  )) as any;
  const usdcMint = poolAccount.usdcMint as anchor.web3.PublicKey;
  const poolVault = poolAccount.vault as anchor.web3.PublicKey;

  console.log("USDC mint:", usdcMint.toBase58());
  console.log("Pool vault:", poolVault.toBase58());
  console.log("Oracle authority:", oracleKp.publicKey.toBase58());

  // Fund admin USDC ATA if needed
  const adminUsdc = await createAssociatedTokenAccountIdempotent(
    connection,
    admin,
    usdcMint,
    admin.publicKey
  );
  // Mint 100 USDC for premium payment
  await mintTo(connection, admin, usdcMint, adminUsdc, admin, BigInt(100_000_000));
  console.log("Minted 100 USDC to admin");

  // Policy params
  const nonce = new anchor.BN(Date.now());
  const payoutAmount = new anchor.BN(50_000_000);  // 50 USDC
  const premiumAmount = new anchor.BN(3_000_000);  // 3 USDC (6% of payout — above 5% floor)

  // Trigger: rainfall < 200 (= 2mm * 100 scale)
  const triggerCondition = {
    oraclePubkey: oracleKp.publicKey,
    scopeHash: Array.from(createHash("sha256").update("flood:Mississippi").digest()),
    threshold: new anchor.BN(200),  // 200 = 2.00mm scaled
    comparison: 1,                   // LessThan
  };

  const expiresAt = new anchor.BN(Math.floor(Date.now() / 1000) + 30 * 86400);

  const [policyPda] = anchor.web3.PublicKey.findProgramAddressSync(
    [
      Buffer.from("policy"),
      admin.publicKey.toBuffer(),
      CROP_POOL.toBuffer(),
      Buffer.from(nonce.toArray("le", 8)),
    ],
    PROGRAM_ID
  );

  const [poolConfigPda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("pool_config"), CROP_POOL.toBuffer()],
    PROGRAM_ID
  );

  console.log("\nCreating policy...");
  console.log("Policy PDA:", policyPda.toBase58());

  const tx = await (program as any).methods
    .createPolicy(1, payoutAmount, premiumAmount, triggerCondition, expiresAt, nonce)
    .accounts({
      policyholder: admin.publicKey,
      policy: policyPda,
      pool: CROP_POOL,
      poolConfig: poolConfigPda,
      policyholderUsdc: adminUsdc,
      poolVault,
      usdcMint,
    })
    .rpc();

  console.log("✓ Policy created:", tx);
  console.log("\nPolicy pubkey:", policyPda.toBase58());
  console.log("Trigger: rainfall (x100) < 200 (= < 2mm/day drought)");
  console.log("Payout: 50 USDC");
  console.log("\nTest simulate trigger with:");
  console.log(`  curl -X POST http://localhost:3001/api/simulate-trigger \\`);
  console.log(`    -H 'Content-Type: application/json' \\`);
  console.log(`    -d '{"policy":"${policyPda.toBase58()}","oracle_value":100}'`);
}

main().catch((e) => {
  console.error("Failed:", e.message);
  process.exit(1);
});
