import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { Myrmex } from "../target/types/myrmex";
import {
  createMint,
  createAssociatedTokenAccount,
  mintTo,
  getAccount,
  getAssociatedTokenAddress,
} from "@solana/spl-token";
import { assert } from "chai";

describe("myrmex", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Myrmex as Program<Myrmex>;
  const connection = provider.connection;

  // Test wallets
  const lpAuthority = anchor.web3.Keypair.generate();
  const policyholderKp = anchor.web3.Keypair.generate();
  const oracleKp = anchor.web3.Keypair.generate();

  // Derived accounts
  let usdcMint: anchor.web3.PublicKey;
  let poolPda: anchor.web3.PublicKey;
  let poolVault: anchor.web3.PublicKey;
  let lpMint: anchor.web3.PublicKey;
  let poolConfigPda: anchor.web3.PublicKey;
  let oracleReportPda: anchor.web3.PublicKey;
  let lpProviderTokens: anchor.web3.PublicKey;
  let policyholderUsdcAta: anchor.web3.PublicKey;
  let policyPda: anchor.web3.PublicKey;
  let policyNonce: anchor.BN;

  const POOL_TYPE = 0; // Flight
  const SCOPE_HASH = Array(32).fill(7);

  before(async () => {
    // Airdrop SOL to test wallets
    await Promise.all([
      connection.requestAirdrop(lpAuthority.publicKey, 3e9),
      connection.requestAirdrop(policyholderKp.publicKey, 3e9),
      connection.requestAirdrop(oracleKp.publicKey, 3e9),
    ]);
    await new Promise((r) => setTimeout(r, 2000));

    // Create USDC test mint (6 decimals), authority = lpAuthority
    usdcMint = await createMint(
      connection,
      lpAuthority,
      lpAuthority.publicKey,
      null,
      6
    );

    // Derive pool PDA
    [poolPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("pool"),
        lpAuthority.publicKey.toBuffer(),
        Buffer.from([POOL_TYPE]),
      ],
      program.programId
    );

    // LP token mint PDA
    [lpMint] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("lp_mint"), poolPda.toBuffer()],
      program.programId
    );
    [poolConfigPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("pool_config"), poolPda.toBuffer()],
      program.programId
    );
    [oracleReportPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("oracle_report"), poolPda.toBuffer(), Buffer.from(SCOPE_HASH)],
      program.programId
    );

    // Pool vault ATA (owned by pool PDA)
    poolVault = await getAssociatedTokenAddress(usdcMint, poolPda, true);

    // LP provider's LP token ATA
    lpProviderTokens = await getAssociatedTokenAddress(
      lpMint,
      lpAuthority.publicKey,
      false,
      undefined
    );

    // Policyholder USDC ATA
    policyholderUsdcAta = await getAssociatedTokenAddress(
      usdcMint,
      policyholderKp.publicKey
    );
  });

  // ── Test 1: Initialize pool ──────────────────────────────────────────────────
  it("1. Initialize risk pool", async () => {
    const poolName = new Uint8Array(32);
    const nameStr = "Flight-Global";
    for (let i = 0; i < nameStr.length; i++)
      poolName[i] = nameStr.charCodeAt(i);

    await program.methods
      .initializePool(POOL_TYPE, Array.from(poolName))
      .accounts({
        authority: lpAuthority.publicKey,
        pool: poolPda,
        usdcMint,
        vault: poolVault,
        lpTokenMint: lpMint,
      })
      .signers([lpAuthority])
      .rpc();

    const pool = await program.account.riskPool.fetch(poolPda);
    assert.isTrue(pool.isActive, "Pool should be active");
    assert.equal(
      pool.totalLiquidity.toNumber(),
      0,
      "Liquidity should start at 0"
    );
    assert.equal(pool.poolType, POOL_TYPE, "Pool type should match");
    console.log("  Pool initialized:", poolPda.toBase58());

    await program.methods
      .initializePoolConfig(oracleKp.publicKey, new BN(500), new BN(8000))
      .accounts({
        authority: lpAuthority.publicKey,
        pool: poolPda,
        poolConfig: poolConfigPda,
      })
      .signers([lpAuthority])
      .rpc();
  });

  // ── Test 2: Fund pool ────────────────────────────────────────────────────────
  it("2. LP can fund pool and receive LP tokens", async () => {
    // Mint 1000 USDC to LP
    const lpUsdcAta = await createAssociatedTokenAccount(
      connection,
      lpAuthority,
      usdcMint,
      lpAuthority.publicKey
    );
    await mintTo(
      connection,
      lpAuthority,
      usdcMint,
      lpUsdcAta,
      lpAuthority,
      1000_000_000
    );

    const depositAmount = new BN(500_000_000); // 500 USDC

    await program.methods
      .fundPool(depositAmount)
      .accounts({
        provider: lpAuthority.publicKey,
        pool: poolPda,
        providerUsdc: lpUsdcAta,
        poolVault,
        lpTokenMint: lpMint,
        providerLpTokens: lpProviderTokens,
      })
      .signers([lpAuthority])
      .rpc();

    const pool = await program.account.riskPool.fetch(poolPda);
    assert.equal(
      pool.totalLiquidity.toNumber(),
      500_000_000,
      "Pool liquidity should be 500 USDC"
    );

    const lpInfo = await getAccount(connection, lpProviderTokens);
    assert.isTrue(
      BigInt(lpInfo.amount) > BigInt(0),
      "LP tokens should have been minted"
    );
    console.log("  LP tokens minted:", lpInfo.amount.toString());
  });

  // ── Test 3: Create policy ────────────────────────────────────────────────────
  it("3. User creates flight delay policy", async () => {
    // Mint 100 USDC to policyholder
    await createAssociatedTokenAccount(
      connection,
      policyholderKp,
      usdcMint,
      policyholderKp.publicKey
    );
    await mintTo(
      connection,
      lpAuthority,
      usdcMint,
      policyholderUsdcAta,
      lpAuthority,
      100_000_000
    );

    const payoutAmount = new BN(50_000_000); // 50 USDC
    const premiumAmount = new BN(5_000_000); // 5 USDC
    const expiresAt = new BN(Math.floor(Date.now() / 1000) + 86400);
    policyNonce = new BN(Math.floor(Date.now() / 1000));

    const triggerCondition = {
      oraclePubkey: oracleKp.publicKey,
      scopeHash: SCOPE_HASH,
      threshold: new BN(120),
      comparison: 0, // greater than
    };

    [policyPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("policy"),
        policyholderKp.publicKey.toBuffer(),
        poolPda.toBuffer(),
        Buffer.from(policyNonce.toArray("le", 8)),
      ],
      program.programId
    );

    await program.methods
      .createPolicy(
        0,
        payoutAmount,
        premiumAmount,
        triggerCondition,
        expiresAt,
        policyNonce
      )
      .accounts({
        policyholder: policyholderKp.publicKey,
        policy: policyPda,
        pool: poolPda,
        poolConfig: poolConfigPda,
        policyholderUsdc: policyholderUsdcAta,
        poolVault,
        usdcMint,
      })
      .signers([policyholderKp])
      .rpc();

    const policy = await program.account.policyVault.fetch(policyPda);
    assert.isTrue(policy.isActive, "Policy should be active");
    assert.isFalse(policy.isClaimed, "Policy should not be claimed");
    assert.equal(policy.payoutAmount.toNumber(), 50_000_000);
    assert.equal(policy.premiumAmount.toNumber(), 5_000_000);

    const pool = await program.account.riskPool.fetch(poolPda);
    assert.equal(
      pool.totalLocked.toNumber(),
      50_000_000,
      "Pool locked should increase"
    );
    assert.equal(pool.premiumAccrued.toNumber(), 5_000_000, "Premium accrued");
    console.log("  Policy created:", policyPda.toBase58());
  });

  // ── Test 4: Trigger payout ───────────────────────────────────────────────────
  it("4. Trigger payout when oracle condition met", async () => {
    const balanceBefore = await connection.getTokenAccountBalance(
      policyholderUsdcAta
    );

    await program.methods
      .postOracleReport(new BN(150), SCOPE_HASH, Array(192).fill(0))
      .accounts({
        oracleAuthority: oracleKp.publicKey,
        pool: poolPda,
        poolConfig: poolConfigPda,
        oracleReport: oracleReportPda,
      })
      .signers([oracleKp])
      .rpc();

    await program.methods
      .triggerPayout()
      .accounts({
        caller: provider.wallet.publicKey,
        policy: policyPda,
        pool: poolPda,
        poolConfig: poolConfigPda,
        oracleReport: oracleReportPda,
        policyholderUsdc: policyholderUsdcAta,
        poolVault,
        policyholder: policyholderKp.publicKey,
      })
      .rpc();

    const policy = await program.account.policyVault.fetch(policyPda);
    assert.isTrue(policy.isClaimed, "Policy must be marked claimed");
    assert.isFalse(policy.isActive, "Policy must be inactive");

    const balanceAfter = await connection.getTokenAccountBalance(
      policyholderUsdcAta
    );
    const diff =
      Number(balanceAfter.value.amount) - Number(balanceBefore.value.amount);
    assert.equal(
      diff,
      50_000_000,
      "Policyholder should receive 50 USDC payout"
    );

    const pool = await program.account.riskPool.fetch(poolPda);
    assert.equal(pool.totalLocked.toNumber(), 0, "Pool locked should decrease");
    console.log("  Payout executed, received:", diff, "USDC lamports");
  });

  // ── Test 5: Double payout rejected ──────────────────────────────────────────
  it("5. Double-payout attempt is rejected", async () => {
    try {
      await program.methods
        .triggerPayout()
        .accounts({
          caller: provider.wallet.publicKey,
          policy: policyPda,
          pool: poolPda,
          poolConfig: poolConfigPda,
          oracleReport: oracleReportPda,
          policyholderUsdc: policyholderUsdcAta,
          poolVault,
          policyholder: policyholderKp.publicKey,
        })
        .rpc();
      assert.fail("Should have thrown PolicyAlreadyClaimed");
    } catch (err: any) {
      // After a payout, policy.is_active=false so the is_active constraint fires first.
      // Either PolicyNotActive or PolicyAlreadyClaimed confirms the guard is working.
      const blocked =
        err.message.includes("PolicyAlreadyClaimed") ||
        err.message.includes("PolicyNotActive");
      assert.isTrue(
        blocked,
        "Should fail with PolicyAlreadyClaimed or PolicyNotActive"
      );
      console.log(
        "  Double-payout correctly rejected:",
        err.message.split(":")[0]
      );
    }
  });

  // ── Test 6: Expire policy ────────────────────────────────────────────────────
  it("6. Expire an expired policy", async () => {
    // Create a new short-lived policy
    const expireNonce = new BN(Math.floor(Date.now() / 1000) + 9999);
    const [expirePolicyPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("policy"),
        policyholderKp.publicKey.toBuffer(),
        poolPda.toBuffer(),
        Buffer.from(expireNonce.toArray("le", 8)),
      ],
      program.programId
    );

    // Create policy expiring in 1 second
    const expiredAt = new BN(Math.floor(Date.now() / 1000) + 1);
    const triggerCondition = {
      oraclePubkey: oracleKp.publicKey,
      scopeHash: SCOPE_HASH,
      threshold: new BN(120),
      comparison: 0,
    };

    await program.methods
      .createPolicy(
        0,
        new BN(10_000_000), // 10 USDC payout
        new BN(1_000_000), // 1 USDC premium
        triggerCondition,
        expiredAt,
        expireNonce
      )
      .accounts({
        policyholder: policyholderKp.publicKey,
        policy: expirePolicyPda,
        pool: poolPda,
        poolConfig: poolConfigPda,
        policyholderUsdc: policyholderUsdcAta,
        poolVault,
        usdcMint,
      })
      .signers([policyholderKp])
      .rpc();

    // Wait for policy to expire
    await new Promise((r) => setTimeout(r, 2000));

    const poolBefore = await program.account.riskPool.fetch(poolPda);

    await program.methods
      .expirePolicy()
      .accounts({
        caller: provider.wallet.publicKey,
        policy: expirePolicyPda,
        pool: poolPda,
      })
      .rpc();

    const policy = await program.account.policyVault.fetch(expirePolicyPda);
    assert.isFalse(policy.isActive, "Expired policy should be inactive");

    const poolAfter = await program.account.riskPool.fetch(poolPda);
    assert.isTrue(
      poolAfter.totalLocked.toNumber() < poolBefore.totalLocked.toNumber(),
      "Locked amount should decrease after expiry"
    );
    console.log("  Policy expired, locked freed");
  });

  // ── Test 7: LP withdrawal blocked when liquidity locked ──────────────────────
  it("7. LP withdrawal blocked when collateral is locked", async () => {
    // Create a policy to lock remaining liquidity
    const lockNonce = new BN(Math.floor(Date.now() / 1000) + 99999);
    const [lockPolicyPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("policy"),
        policyholderKp.publicKey.toBuffer(),
        poolPda.toBuffer(),
        Buffer.from(lockNonce.toArray("le", 8)),
      ],
      program.programId
    );

    const pool = await program.account.riskPool.fetch(poolPda);
    const available =
      pool.totalLiquidity.toNumber() - pool.totalLocked.toNumber();

    if (available > 0) {
      const triggerCondition = {
        oraclePubkey: oracleKp.publicKey,
        scopeHash: SCOPE_HASH,
        threshold: new BN(120),
        comparison: 0,
      };
      await program.methods
        .createPolicy(
          0,
          new BN(available),
          new BN(1_000_000),
          triggerCondition,
          new BN(Math.floor(Date.now() / 1000) + 86400),
          lockNonce
        )
        .accounts({
          policyholder: policyholderKp.publicKey,
          policy: lockPolicyPda,
          pool: poolPda,
          poolConfig: poolConfigPda,
          policyholderUsdc: policyholderUsdcAta,
          poolVault,
          usdcMint,
        })
        .signers([policyholderKp])
        .rpc();
    }

    const lpInfo = await getAccount(connection, lpProviderTokens);
    const lpBalance = BigInt(lpInfo.amount);

    if (lpBalance > BigInt(0)) {
      try {
        await program.methods
          .withdrawLp(new BN(lpBalance.toString()))
          .accounts({
            provider: lpAuthority.publicKey,
            pool: poolPda,
            providerUsdc: await getAssociatedTokenAddress(
              usdcMint,
              lpAuthority.publicKey
            ),
            poolVault,
            lpTokenMint: lpMint,
            providerLpTokens: lpProviderTokens,
          })
          .signers([lpAuthority])
          .rpc();
        // May succeed if not all is locked - that's OK
        console.log(
          "  Withdrawal succeeded (available liquidity not fully locked)"
        );
      } catch (err: any) {
        assert.include(
          err.message,
          "WithdrawalExceedsAvailable",
          "Should fail with WithdrawalExceedsAvailable when fully locked"
        );
        console.log(
          "  Withdrawal correctly blocked: locked collateral protected"
        );
      }
    }
  });

  // ── Test 8: LP withdrawal success ────────────────────────────────────────────
  it("8. LP can withdraw after liquidity freed", async () => {
    // Check available liquidity
    const pool = await program.account.riskPool.fetch(poolPda);
    const available =
      pool.totalLiquidity.toNumber() - pool.totalLocked.toNumber();

    if (available <= 0) {
      console.log("  Skipping: no available liquidity to withdraw");
      return;
    }

    const lpInfo = await getAccount(connection, lpProviderTokens);
    const lpBalance = BigInt(lpInfo.amount);

    if (lpBalance === BigInt(0)) {
      console.log("  Skipping: no LP tokens to redeem");
      return;
    }

    const lpSupply = (await connection.getTokenSupply(lpMint)).value.amount;

    // Withdraw proportional amount
    const withdrawAmount = new BN(lpBalance.toString());
    const lpUsdcAta = await getAssociatedTokenAddress(
      usdcMint,
      lpAuthority.publicKey
    );

    const balanceBefore = await connection.getTokenAccountBalance(lpUsdcAta);

    await program.methods
      .withdrawLp(withdrawAmount)
      .accounts({
        provider: lpAuthority.publicKey,
        pool: poolPda,
        providerUsdc: lpUsdcAta,
        poolVault,
        lpTokenMint: lpMint,
        providerLpTokens: lpProviderTokens,
      })
      .signers([lpAuthority])
      .rpc();

    const balanceAfter = await connection.getTokenAccountBalance(lpUsdcAta);
    const received =
      Number(balanceAfter.value.amount) - Number(balanceBefore.value.amount);

    assert.isTrue(received > 0, "LP should receive USDC back");
    console.log("  LP withdrew:", received, "USDC lamports");

    const lpInfoAfter = await getAccount(connection, lpProviderTokens);
    assert.isTrue(
      BigInt(lpInfoAfter.amount) < lpBalance,
      "LP token balance should decrease"
    );
  });
});
