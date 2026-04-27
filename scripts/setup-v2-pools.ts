/**
 * MYRMEX v2 Pool Setup
 * ─────────────────────
 * Creates 6 new risk pools for the v2 category set:
 *   0 = Earthquake     (USGS magnitude * 100 on-chain)
 *   1 = Flood          (USGS gauge height feet * 10)
 *   2 = Crop-MultiF    (composite score 0–10000; 10000 = perfect)
 *   3 = Hurricane      (max sustained wind knots)
 *   4 = Stablecoin     (USDC price in basis points; 10000 = $1.00)
 *   5 = Bridge-Hack    (combined bridge TVL in millions)
 *
 * Uses the EXISTING USDC mint so Phantom wallets don't need re-funding.
 *
 * Usage:
 *   npx ts-node scripts/setup-v2-pools.ts
 */

import * as anchor from "@coral-xyz/anchor";
import {
  createAssociatedTokenAccountIdempotent,
  getAssociatedTokenAddress,
  mintTo,
} from "@solana/spl-token";
import * as fs from "fs";
import * as path from "path";

const PROGRAM_ID = new anchor.web3.PublicKey(
  "9naJhrt9FdAHLwdLnQfgx6citNgEWmW8aLovCS9kYpan"
);

// Reuse existing devnet USDC mint (admin has mint authority)
const USDC_MINT = new anchor.web3.PublicKey(
  "HM4vdUJGhAbD44G1CDQ7gx6HFUTvaoCgxtkNPXNfP9jo"
);

const V2_POOLS = [
  {
    type: 0,
    name: "Earthquake-Pac", // 14 chars — fits in 32-byte name
    seedUsdc: 5_000,
    minPremiumBps: 200, // 2% — lower because quakes are high-severity, rare
    maxCoverageBps: 5000,
    desc: "Pacific Ring of Fire M5.0+",
  },
  {
    type: 1,
    name: "Flood-US-Rivers",
    seedUsdc: 5_000,
    minPremiumBps: 300,
    maxCoverageBps: 6000,
    desc: "USGS river gauge above flood stage",
  },
  {
    type: 2,
    name: "Crop-MultiF",
    seedUsdc: 8_000,
    minPremiumBps: 400,
    maxCoverageBps: 7000,
    desc: "Composite: heat + rain deficit + dry days",
  },
  {
    type: 3,
    name: "Hurricane-Gulf",
    seedUsdc: 6_000,
    minPremiumBps: 500,
    maxCoverageBps: 6000,
    desc: "NOAA NHC wind speed in Gulf/Caribbean",
  },
  {
    type: 4,
    name: "USDC-Depeg",
    seedUsdc: 10_000,
    minPremiumBps: 50, // 0.5% — depeg events are rare, high liquidity needed
    maxCoverageBps: 9000,
    desc: "USDC/USDT price below $0.97",
  },
  {
    type: 5,
    name: "Bridge-Hack",
    seedUsdc: 5_000,
    minPremiumBps: 100, // 1%
    maxCoverageBps: 7000,
    desc: "DeFiLlama bridge TVL collapse detection",
  },
];

function nameToBytes(name: string): number[] {
  const buf = new Uint8Array(32);
  name
    .slice(0, 32)
    .split("")
    .forEach((c, i) => (buf[i] = c.charCodeAt(0)));
  return Array.from(buf);
}

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
    fs.readFileSync(path.join(__dirname, "../target/idl/myrmex.json"), "utf-8")
  );
  const program = new anchor.Program(idl, provider);

  const bal = await connection.getBalance(admin.publicKey);
  console.log("\nMYRMEX v2 Pool Setup");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("Admin:          ", admin.publicKey.toBase58());
  console.log("Oracle:         ", oracleKp.publicKey.toBase58());
  console.log("SOL balance:    ", (bal / 1e9).toFixed(3), "SOL");
  console.log("USDC mint:      ", USDC_MINT.toBase58());

  if (bal < 0.3e9) {
    console.error(
      "❌ Need at least 0.3 SOL. Run: solana airdrop 2 --url devnet"
    );
    process.exit(1);
  }

  // Ensure admin USDC ATA exists and mint seed capital
  const adminUsdc = await createAssociatedTokenAccountIdempotent(
    connection,
    admin,
    USDC_MINT,
    admin.publicKey
  );
  const totalSeed = V2_POOLS.reduce((s, p) => s + p.seedUsdc, 0);
  await mintTo(
    connection,
    admin,
    USDC_MINT,
    adminUsdc,
    admin,
    BigInt(totalSeed * 1_000_000)
  );
  console.log(`\nMinted ${totalSeed} USDC seed capital to admin`);

  const results: any[] = [];

  for (const pool of V2_POOLS) {
    console.log(`\n── ${pool.name} (type ${pool.type}) ─────────────────────`);
    console.log(`   ${pool.desc}`);

    const [poolPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("pool"),
        admin.publicKey.toBuffer(),
        Buffer.from([pool.type]),
      ],
      PROGRAM_ID
    );
    const [lpMint] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("lp_mint"), poolPda.toBuffer()],
      PROGRAM_ID
    );
    const [poolConfigPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("pool_config"), poolPda.toBuffer()],
      PROGRAM_ID
    );
    const poolVault = await getAssociatedTokenAddress(USDC_MINT, poolPda, true);

    // 1. Initialize pool
    try {
      await (program as any).methods
        .initializePool(pool.type, nameToBytes(pool.name))
        .accounts({
          authority: admin.publicKey,
          pool: poolPda,
          usdcMint: USDC_MINT,
          vault: poolVault,
          lpTokenMint: lpMint,
        })
        .rpc();
      console.log("   ✓ Pool initialized:", poolPda.toBase58());
    } catch (e: any) {
      if (
        e.message?.includes("already in use") ||
        e.message?.includes("custom program error: 0x0")
      ) {
        console.log("   ℹ Pool already exists:", poolPda.toBase58());
      } else throw e;
    }

    // 2. Fund pool
    const adminLpAta = await createAssociatedTokenAccountIdempotent(
      connection,
      admin,
      lpMint,
      admin.publicKey
    );
    try {
      await (program as any).methods
        .fundPool(new anchor.BN(pool.seedUsdc * 1_000_000))
        .accounts({
          provider: admin.publicKey,
          pool: poolPda,
          providerUsdc: adminUsdc,
          poolVault,
          lpTokenMint: lpMint,
          providerLpTokens: adminLpAta,
        })
        .rpc();
      console.log(`   ✓ Seeded $${pool.seedUsdc.toLocaleString()} USDC`);
    } catch (e: any) {
      console.log("   ⚠ Fund pool:", e.message.slice(0, 80));
    }

    // 3. Initialize pool config
    try {
      await (program as any).methods
        .initializePoolConfig(
          oracleKp.publicKey,
          new anchor.BN(pool.minPremiumBps),
          new anchor.BN(pool.maxCoverageBps)
        )
        .accounts({
          authority: admin.publicKey,
          pool: poolPda,
          poolConfig: poolConfigPda,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
      console.log("   ✓ PoolConfig:  ", poolConfigPda.toBase58());
      console.log(
        `   ✓ Min premium: ${pool.minPremiumBps / 100}%  Max coverage: ${
          pool.maxCoverageBps / 100
        }%`
      );
    } catch (e: any) {
      if (
        e.message?.includes("already in use") ||
        e.message?.includes("already initialized")
      ) {
        console.log(
          "   ℹ PoolConfig already exists:",
          poolConfigPda.toBase58()
        );
      } else throw e;
    }

    results.push({
      name: pool.name,
      type: pool.type,
      pool: poolPda.toBase58(),
      poolConfig: poolConfigPda.toBase58(),
    });
  }

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("✅ v2 setup complete!\n");
  console.log("Railway oracle env vars:");
  for (const r of results) {
    const key = r.name.toUpperCase().replace(/-/g, "_").split("_")[0];
    console.log(`  ${key}_POOL=${r.pool}`);
  }
  console.log("\nAll pool pubkeys:");
  for (const r of results) {
    console.log(`  ${r.name} (type ${r.type}): ${r.pool}`);
    console.log(`    PoolConfig: ${r.poolConfig}`);
  }
}

main().catch((e) => {
  console.error("\n❌ Failed:", e.message);
  process.exit(1);
});
