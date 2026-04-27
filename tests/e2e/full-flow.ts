/**
 * MYRMEX full-flow e2e test
 * Run: npx ts-node tests/e2e/full-flow.ts
 *
 * Tests: fund pool → create policy → trigger payout → double-payout rejected
 */

import * as anchor from "@coral-xyz/anchor";
import {
  createMint,
  createAssociatedTokenAccount,
  mintTo,
  getAccount,
  getAssociatedTokenAddress,
} from "@solana/spl-token";
import * as fs from "fs";
import * as path from "path";

const PROGRAM_ID = new anchor.web3.PublicKey(
  "9naJhrt9FdAHLwdLnQfgx6citNgEWmW8aLovCS9kYpan"
);

async function runFullFlow() {
  console.log("\n🐜 MYRMEX Full Flow E2E Test\n");
  const start = Date.now();

  const connection = new anchor.web3.Connection(
    "http://localhost:8899",
    "confirmed"
  );

  // Load wallet from default keypair
  const keypairPath = path.join(
    process.env.HOME || "~",
    ".config/solana/id.json"
  );
  const admin = anchor.web3.Keypair.fromSecretKey(
    Buffer.from(JSON.parse(fs.readFileSync(keypairPath, "utf-8")))
  );

  const lp = anchor.web3.Keypair.generate();
  const policyholder = anchor.web3.Keypair.generate();
  const oracle = anchor.web3.Keypair.generate();

  // Airdrop
  for (const kp of [lp, policyholder, oracle]) {
    await connection.requestAirdrop(kp.publicKey, 2e9);
  }
  await new Promise((r) => setTimeout(r, 1000));

  const wallet = new anchor.Wallet(admin);
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);

  const idl = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "../../target/idl/myrmex.json"),
      "utf-8"
    )
  );
  const program = new anchor.Program(idl, provider);

  // Create test USDC
  const usdcMint = await createMint(
    connection,
    admin,
    admin.publicKey,
    null,
    6
  );
  console.log("USDC mint:", usdcMint.toBase58());

  // Derive pool PDA
  const POOL_TYPE = 0;
  const [poolPda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("pool"), admin.publicKey.toBuffer(), Buffer.from([POOL_TYPE])],
    PROGRAM_ID
  );
  const [lpMint] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("lp_mint"), poolPda.toBuffer()],
    PROGRAM_ID
  );
  const poolVault = await getAssociatedTokenAddress(usdcMint, poolPda, true);
  const SCOPE_HASH = Array(32).fill(7);
  const [poolConfigPda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("pool_config"), poolPda.toBuffer()],
    PROGRAM_ID
  );
  const [oracleReportPda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("oracle_report"), poolPda.toBuffer(), Buffer.from(SCOPE_HASH)],
    PROGRAM_ID
  );

  // 1. Initialize pool
  console.log("\n1. Creating pool...");
  const poolName = new Uint8Array(32);
  "E2E-Test".split("").forEach((c, i) => (poolName[i] = c.charCodeAt(0)));
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
  console.log("   Pool:", poolPda.toBase58());

  await (program as any).methods
    .initializePoolConfig(
      oracle.publicKey,
      new anchor.BN(500),
      new anchor.BN(8000)
    )
    .accounts({
      authority: admin.publicKey,
      pool: poolPda,
      poolConfig: poolConfigPda,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .rpc();

  // 2. Fund pool
  console.log("\n2. Funding pool with 500 USDC...");
  const lpUsdcAta = await createAssociatedTokenAccount(
    connection,
    lp,
    usdcMint,
    lp.publicKey
  );
  await mintTo(connection, admin, usdcMint, lpUsdcAta, admin, 1000_000_000);
  const lpTokensAta = await getAssociatedTokenAddress(lpMint, lp.publicKey);

  await (program as any).methods
    .fundPool(new anchor.BN(500_000_000))
    .accounts({
      provider: lp.publicKey,
      pool: poolPda,
      providerUsdc: lpUsdcAta,
      poolVault,
      lpTokenMint: lpMint,
      providerLpTokens: lpTokensAta,
    })
    .signers([lp])
    .rpc();
  const lpInfo = await getAccount(connection, lpTokensAta);
  console.log("   LP tokens minted:", lpInfo.amount.toString());

  // 3. Create policy
  console.log("\n3. Creating flight delay policy...");
  const phUsdcAta = await createAssociatedTokenAccount(
    connection,
    policyholder,
    usdcMint,
    policyholder.publicKey
  );
  await mintTo(connection, admin, usdcMint, phUsdcAta, admin, 100_000_000);

  const nonce = new anchor.BN(Math.floor(Date.now() / 1000));
  const [policyPda] = anchor.web3.PublicKey.findProgramAddressSync(
    [
      Buffer.from("policy"),
      policyholder.publicKey.toBuffer(),
      poolPda.toBuffer(),
      Buffer.from(nonce.toArray("le", 8)),
    ],
    PROGRAM_ID
  );

  await (program as any).methods
    .createPolicy(
      0,
      new anchor.BN(50_000_000),
      new anchor.BN(5_000_000),
      {
        oraclePubkey: oracle.publicKey,
        scopeHash: SCOPE_HASH,
        threshold: new anchor.BN(120),
        comparison: 0,
      },
      new anchor.BN(Math.floor(Date.now() / 1000) + 86400),
      nonce
    )
    .accounts({
      policyholder: policyholder.publicKey,
      policy: policyPda,
      pool: poolPda,
      poolConfig: poolConfigPda,
      policyholderUsdc: phUsdcAta,
      poolVault,
      usdcMint,
    })
    .signers([policyholder])
    .rpc();
  console.log("   Policy:", policyPda.toBase58());

  // 4. Trigger payout
  console.log("\n4. Posting oracle trigger (150 minutes)...");
  await (program as any).methods
    .postOracleReport(new anchor.BN(150), SCOPE_HASH, Array(192).fill(0))
    .accounts({
      oracleAuthority: oracle.publicKey,
      pool: poolPda,
      poolConfig: poolConfigPda,
      oracleReport: oracleReportPda,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .signers([oracle])
    .rpc();

  console.log("\n5. Triggering payout...");
  const balBefore = (await connection.getTokenAccountBalance(phUsdcAta)).value
    .uiAmount;

  await (program as any).methods
    .triggerPayout()
    .accounts({
      caller: admin.publicKey,
      policy: policyPda,
      pool: poolPda,
      poolConfig: poolConfigPda,
      oracleReport: oracleReportPda,
      policyholderUsdc: phUsdcAta,
      poolVault,
      policyholder: policyholder.publicKey,
    })
    .rpc();

  // 5. Verify payout
  console.log("\n6. Verifying payout received...");
  const balAfter = (await connection.getTokenAccountBalance(phUsdcAta)).value
    .uiAmount;
  const received = (balAfter ?? 0) - (balBefore ?? 0);
  if (received !== 50) throw new Error(`Expected 50 USDC, got ${received}`);
  console.log("   ✓ Policyholder received:", received, "USDC");

  // 6. Double-payout rejected
  console.log("\n7. Attempting double-payout (should fail)...");
  try {
    await (program as any).methods
      .triggerPayout()
      .accounts({
        caller: admin.publicKey,
        policy: policyPda,
        pool: poolPda,
        poolConfig: poolConfigPda,
        oracleReport: oracleReportPda,
        policyholderUsdc: phUsdcAta,
        poolVault,
        policyholder: policyholder.publicKey,
      })
      .rpc();
    throw new Error("Should have failed!");
  } catch (e: any) {
    if (e.message === "Should have failed!") throw e;
    console.log("   ✓ Double-payout correctly rejected");
  }

  const elapsed = Date.now() - start;
  console.log(`\n✅ SUCCESS — Full flow completed in ${elapsed}ms`);
  console.log("Policy pubkey:", policyPda.toBase58());
}

runFullFlow().catch((e) => {
  console.error("\n❌ FAILED:", e.message);
  process.exit(1);
});
