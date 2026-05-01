/**
 * init-pool-configs.ts
 * ─────────────────────
 * Creates a PoolConfig PDA for each of the 6 canonical devnet pools.
 * Safe to re-run — skips pools that already have a config.
 *
 * Usage:
 *   ANCHOR_WALLET=~/.config/solana/id.json npx ts-node scripts/init-pool-configs.ts
 */

import * as anchor from "@coral-xyz/anchor";
import * as fs from "fs";
import * as path from "path";

const PROGRAM_ID = new anchor.web3.PublicKey(
  "9naJhrt9FdAHLwdLnQfgx6citNgEWmW8aLovCS9kYpan"
);

const CANONICAL_POOLS = [
  { name: "Earthquake-Pacific", pubkey: "EHxPZAMvRhumjFeChfeD9bn2Ju1RWf7RM45pY5vzEhNH", minPremiumBps: 500, maxCoverageBps: 8000 },
  { name: "Flood-US-Rivers",    pubkey: "HfyGsQVVsxt6BNM7UzTepBo91DKYdqLy7RKuLrwnM1YY", minPremiumBps: 400, maxCoverageBps: 8000 },
  { name: "Crop-MultiF",        pubkey: "HuPG3dmBftRCAwg71tro7pmp2hjoCT8KWaNtytwUqUo2", minPremiumBps: 500, maxCoverageBps: 7500 },
  { name: "Hurricane-Gulf",     pubkey: "ZZWgmeRUSdQyuarSb2zPFron2x88UgexhTQn8hJr9uD",  minPremiumBps: 600, maxCoverageBps: 7500 },
  { name: "USDC-Depeg",         pubkey: "CcGbU74HpT8sjDU5NDDWFzBPYEARBEfAac4ovDWwgxWU", minPremiumBps: 300, maxCoverageBps: 9000 },
  { name: "Bridge-Hack",        pubkey: "AqKUYemw3A6GbYFnCFwE9S1f1QCfhH4EAjFQCDxyfUtQ", minPremiumBps: 350, maxCoverageBps: 8500 },
];

async function main() {
  const keypairPath =
    process.env.ANCHOR_WALLET ||
    path.join(process.env.HOME || "~", ".config/solana/id.json");

  const admin = anchor.web3.Keypair.fromSecretKey(
    Buffer.from(JSON.parse(fs.readFileSync(keypairPath, "utf-8")))
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
  const program = new anchor.Program(idl as any, provider);

  console.log("Authority (oracle):", admin.publicKey.toBase58());
  console.log("Initializing pool configs...\n");

  for (const pool of CANONICAL_POOLS) {
    const poolPk = new anchor.web3.PublicKey(pool.pubkey);

    const [poolConfigPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("pool_config"), poolPk.toBuffer()],
      PROGRAM_ID
    );

    // Check if already initialized
    const existing = await connection.getAccountInfo(poolConfigPda);
    if (existing) {
      console.log(`ℹ  ${pool.name}: pool_config already exists at ${poolConfigPda.toBase58()}`);
      continue;
    }

    try {
      const tx = await (program as any).methods
        .initializePoolConfig(
          admin.publicKey,                    // oracle_authority = admin (devnet)
          new anchor.BN(pool.minPremiumBps),
          new anchor.BN(pool.maxCoverageBps)
        )
        .accounts({
          authority: admin.publicKey,
          pool: poolPk,
          poolConfig: poolConfigPda,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      console.log(`✓  ${pool.name}`);
      console.log(`   pool_config: ${poolConfigPda.toBase58()}`);
      console.log(`   min_premium: ${pool.minPremiumBps} bps  max_coverage: ${pool.maxCoverageBps} bps`);
      console.log(`   tx: ${tx}\n`);
    } catch (e: any) {
      console.error(`✗  ${pool.name}: ${e.message}\n`);
    }
  }

  console.log("Done.");
}

main().catch(console.error);
