/**
 * MYRMEX Localnet Wallet Setup
 * ─────────────────────────────
 * Funds your Phantom wallet on localnet with:
 *   - 10 SOL (for transaction fees)
 *   - 10,000 test USDC
 *   - Initializes a Flight Delay risk pool (so the /pool page shows data)
 *
 * Usage:
 *   ANCHOR_PROVIDER_URL=http://localhost:8899 \
 *   ANCHOR_WALLET=~/.config/solana/id.json \
 *   PHANTOM_WALLET=<your-phantom-pubkey> \
 *   npx ts-node scripts/setup-localnet-wallet.ts
 *
 * Get your Phantom pubkey: open Phantom → copy address
 */

import * as anchor from "@coral-xyz/anchor";
import {
  createMint,
  createAssociatedTokenAccount,
  mintTo,
  getAssociatedTokenAddress,
  getAccount,
} from "@solana/spl-token";
import * as fs from "fs";
import * as path from "path";

const PROGRAM_ID = new anchor.web3.PublicKey(
  "9naJhrt9FdAHLwdLnQfgx6citNgEWmW8aLovCS9kYpan"
);
const POOL_TYPE = 0; // Flight delay pool

async function main() {
  const phantomAddress = process.env.PHANTOM_WALLET;
  if (!phantomAddress) {
    console.error("❌ Set PHANTOM_WALLET=<your-pubkey> before running");
    process.exit(1);
  }

  const phantomPubkey = new anchor.web3.PublicKey(phantomAddress);

  // Load admin keypair (your local solana keypair)
  const keypairPath =
    process.env.ANCHOR_WALLET ||
    path.join(process.env.HOME || "~", ".config/solana/id.json");
  const admin = anchor.web3.Keypair.fromSecretKey(
    Buffer.from(JSON.parse(fs.readFileSync(keypairPath, "utf-8")))
  );

  const connection = new anchor.web3.Connection(
    process.env.ANCHOR_PROVIDER_URL || "http://localhost:8899",
    "confirmed"
  );

  const wallet = new anchor.Wallet(admin);
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);

  const idl = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../target/idl/myrmex.json"), "utf-8")
  );
  const program = new anchor.Program(idl, provider);

  console.log("\n🐜 MYRMEX Localnet Setup");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("Admin:  ", admin.publicKey.toBase58());
  console.log("Phantom:", phantomPubkey.toBase58());

  // ─── 1. Airdrop SOL to Phantom wallet ────────────────────────────────────
  console.log("\n1. Airdropping 10 SOL to Phantom wallet...");
  const sig = await connection.requestAirdrop(phantomPubkey, 10e9);
  await connection.confirmTransaction(sig);
  const solBal = (await connection.getBalance(phantomPubkey)) / 1e9;
  console.log(`   ✓ Balance: ${solBal} SOL`);

  // ─── 2. Create test USDC mint ─────────────────────────────────────────────
  console.log("\n2. Creating test USDC mint...");
  const usdcMint = await createMint(
    connection,
    admin,
    admin.publicKey, // mint authority
    null,
    6 // 6 decimals (same as real USDC)
  );
  console.log("   ✓ USDC mint:", usdcMint.toBase58());

  // ─── 3. Create USDC token account for Phantom & mint 10,000 USDC ─────────
  console.log("\n3. Minting 10,000 USDC to Phantom wallet...");
  const phantomUsdc = await createAssociatedTokenAccount(
    connection,
    admin,
    usdcMint,
    phantomPubkey
  );
  await mintTo(
    connection,
    admin,
    usdcMint,
    phantomUsdc,
    admin,
    10_000_000_000 // 10,000 USDC (6 decimals)
  );
  const usdcBal = (await getAccount(connection, phantomUsdc)).amount;
  console.log(`   ✓ USDC balance: ${Number(usdcBal) / 1e6} USDC`);

  // ─── 4. Derive pool PDA ───────────────────────────────────────────────────
  const [poolPda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("pool"), admin.publicKey.toBuffer(), Buffer.from([POOL_TYPE])],
    PROGRAM_ID
  );
  const [lpMint] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("lp_mint"), poolPda.toBuffer()],
    PROGRAM_ID
  );
  const poolVault = await getAssociatedTokenAddress(usdcMint, poolPda, true);

  // ─── 5. Initialize flight delay pool ─────────────────────────────────────
  console.log("\n4. Initializing Flight Delay risk pool...");
  const poolName = new Uint8Array(32);
  "Flight-Global".split("").forEach((c, i) => (poolName[i] = c.charCodeAt(0)));

  try {
    await (program as any).methods
      .initializePool(POOL_TYPE, Array.from(poolName))
      .accounts({
        authority: admin.publicKey,
        pool: poolPda,
        usdcMint,
        vault: poolVault,
        lpTokenMint: lpMint,
      })
      .rpc();
    console.log("   ✓ Pool created:", poolPda.toBase58());
  } catch (e: any) {
    if (e.message?.includes("already in use")) {
      console.log("   ℹ Pool already exists:", poolPda.toBase58());
    } else {
      throw e;
    }
  }

  // ─── 6. Seed pool with 2,000 USDC from admin ─────────────────────────────
  console.log("\n5. Seeding pool with 2,000 USDC liquidity...");
  const adminUsdcAta = await createAssociatedTokenAccount(
    connection,
    admin,
    usdcMint,
    admin.publicKey
  ).catch(() => getAssociatedTokenAddress(usdcMint, admin.publicKey));

  await mintTo(connection, admin, usdcMint, adminUsdcAta, admin, 2_000_000_000);

  const adminLpAta = await getAssociatedTokenAddress(lpMint, admin.publicKey);

  await (program as any).methods
    .fundPool(new anchor.BN(2_000_000_000))
    .accounts({
      provider: admin.publicKey,
      pool: poolPda,
      providerUsdc: adminUsdcAta,
      poolVault,
      lpTokenMint: lpMint,
      providerLpTokens: adminLpAta,
    })
    .rpc();
  console.log("   ✓ Pool seeded with 2,000 USDC");

  // ─── 7. Print summary ─────────────────────────────────────────────────────
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("✅ Setup complete!\n");
  console.log("Now do the following in Phantom:");
  console.log(
    "  1. Settings → Developer Settings → Testnets → Enable Custom RPC"
  );
  console.log(
    "     OR: Settings → Change Network → Custom → http://localhost:8899"
  );
  console.log(
    "  2. Import/switch to your wallet at:",
    phantomPubkey.toBase58()
  );
  console.log("  3. Open http://localhost:3000\n");
  console.log("Copy these values into your app/.env.local for local testing:");
  console.log(`  NEXT_PUBLIC_USDC_MINT=${usdcMint.toBase58()}`);
  console.log(`  NEXT_PUBLIC_RPC_URL=http://localhost:8899\n`);
  console.log("Pool details:");
  console.log(`  Pool PDA:  ${poolPda.toBase58()}`);
  console.log(`  LP Mint:   ${lpMint.toBase58()}`);
  console.log(`  Vault:     ${poolVault.toBase58()}`);
  console.log(`  USDC Mint: ${usdcMint.toBase58()}`);
  console.log("\nYour Phantom wallet has:");
  console.log("  10 SOL  (for fees)");
  console.log("  10,000 USDC  (to buy policies and deposit as LP)");
}

main().catch((e) => {
  console.error("\n❌ Failed:", e.message);
  process.exit(1);
});
