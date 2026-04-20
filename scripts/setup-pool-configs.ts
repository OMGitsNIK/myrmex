/**
 * MYRMEX Pool Config Initializer
 * ───────────────────────────────
 * Runs AFTER setup-devnet.ts. Creates a PoolConfig account for each pool,
 * setting the oracle_authority to the oracle service keypair.
 *
 * Usage:
 *   ANCHOR_WALLET=~/.config/solana/id.json \
 *   ORACLE_KEYPAIR=~/.config/solana/oracle.json \
 *   npx ts-node scripts/setup-pool-configs.ts
 *
 * After running, set env vars in Railway oracle service:
 *   FLIGHT_POOL=<flight pool pubkey>
 *   CROP_POOL=<crop pool pubkey>
 *   DEFI_POOL=<defi pool pubkey>
 */

import * as anchor from "@coral-xyz/anchor";
import * as fs from "fs";
import * as path from "path";

const PROGRAM_ID = new anchor.web3.PublicKey(
  "9naJhrt9FdAHLwdLnQfgx6citNgEWmW8aLovCS9kYpan"
);

const POOL_CONFIGS = [
  {
    poolType: 0,
    name: "Flight-Global",
    minPremiumBps: 500,    // 5% of payout
    maxCoverageBps: 8000,  // 80% of liquidity can be locked
  },
  {
    poolType: 1,
    name: "Crop-Drought",
    minPremiumBps: 500,
    maxCoverageBps: 8000,
  },
  {
    poolType: 3,
    name: "DeFi-Hack",
    minPremiumBps: 300,    // 3% — DeFi hack coverage is more commoditized
    maxCoverageBps: 7000,
  },
];

async function main() {
  const adminKeypairPath =
    process.env.ANCHOR_WALLET ||
    path.join(process.env.HOME || "~", ".config/solana/id.json");

  const oracleKeypairPath =
    process.env.ORACLE_KEYPAIR ||
    path.join(process.env.HOME || "~", ".config/solana/oracle.json");

  const admin = anchor.web3.Keypair.fromSecretKey(
    Buffer.from(JSON.parse(fs.readFileSync(adminKeypairPath, "utf-8")))
  );

  let oracleAuthority: anchor.web3.PublicKey;
  if (fs.existsSync(oracleKeypairPath)) {
    const oracleKp = anchor.web3.Keypair.fromSecretKey(
      Buffer.from(JSON.parse(fs.readFileSync(oracleKeypairPath, "utf-8")))
    );
    oracleAuthority = oracleKp.publicKey;
    console.log("Oracle authority:", oracleAuthority.toBase58());
  } else {
    // Fall back to admin as oracle (dev only)
    oracleAuthority = admin.publicKey;
    console.log("⚠ oracle.json not found, using admin as oracle authority (dev only)");
  }

  const connection = new anchor.web3.Connection(
    process.env.RPC_URL || "https://api.devnet.solana.com",
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

  console.log("\nMyrmex Pool Config Setup");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("Admin:  ", admin.publicKey.toBase58());
  console.log("Oracle: ", oracleAuthority.toBase58());

  const poolResults: { name: string; pool: string; poolConfig: string }[] = [];

  for (const cfg of POOL_CONFIGS) {
    const [poolPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("pool"),
        admin.publicKey.toBuffer(),
        Buffer.from([cfg.poolType]),
      ],
      PROGRAM_ID
    );

    const [poolConfigPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("pool_config"), poolPda.toBuffer()],
      PROGRAM_ID
    );

    try {
      await (program as any).methods
        .initializePoolConfig(
          oracleAuthority,
          new anchor.BN(cfg.minPremiumBps),
          new anchor.BN(cfg.maxCoverageBps)
        )
        .accounts({
          authority: admin.publicKey,
          pool: poolPda,
          poolConfig: poolConfigPda,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
      console.log(`\n✓ ${cfg.name}`);
      console.log(`  Pool:       ${poolPda.toBase58()}`);
      console.log(`  PoolConfig: ${poolConfigPda.toBase58()}`);
      console.log(`  Min premium: ${cfg.minPremiumBps} bps (${cfg.minPremiumBps / 100}%)`);
      console.log(`  Max coverage: ${cfg.maxCoverageBps} bps (${cfg.maxCoverageBps / 100}%)`);
    } catch (e: any) {
      if (e.message?.includes("already in use") || e.message?.includes("already initialized")) {
        console.log(`\nℹ ${cfg.name} pool_config already exists`);
      } else {
        console.error(`\n✗ ${cfg.name} failed:`, e.message);
      }
    }

    poolResults.push({
      name: cfg.name,
      pool: poolPda.toBase58(),
      poolConfig: poolConfigPda.toBase58(),
    });
  }

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("✅ Done!\n");
  console.log("Add these to your Railway oracle service env vars:");
  for (const r of poolResults) {
    const envKey = r.name.toUpperCase().replace(/-/g, "_").split("_")[0];
    console.log(`  ${envKey}_POOL=${r.pool}`);
  }
}

main().catch((e) => {
  console.error("\n❌ Failed:", e.message);
  process.exit(1);
});
