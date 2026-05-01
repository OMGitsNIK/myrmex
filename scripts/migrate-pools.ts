/**
 * migrate-pools.ts
 * ────────────────
 * Extends existing devnet pool accounts from the old 203-byte layout to the
 * new 227-byte RiskPool layout (adds junior/mezzanine/senior_liquidity fields).
 *
 * Usage:
 *   ANCHOR_WALLET=~/.config/solana/id.json npx ts-node scripts/migrate-pools.ts
 */

import * as anchor from "@coral-xyz/anchor";
import * as fs from "fs";
import * as path from "path";

const PROGRAM_ID = new anchor.web3.PublicKey(
  "9naJhrt9FdAHLwdLnQfgx6citNgEWmW8aLovCS9kYpan"
);

const CANONICAL_POOLS = [
  { name: "Earthquake-Pacific", pubkey: "EHxPZAMvRhumjFeChfeD9bn2Ju1RWf7RM45pY5vzEhNH" },
  { name: "Flood-US-Rivers",    pubkey: "HfyGsQVVsxt6BNM7UzTepBo91DKYdqLy7RKuLrwnM1YY" },
  { name: "Crop-MultiF",        pubkey: "HuPG3dmBftRCAwg71tro7pmp2hjoCT8KWaNtytwUqUo2" },
  { name: "Hurricane-Gulf",     pubkey: "ZZWgmeRUSdQyuarSb2zPFron2x88UgexhTQn8hJr9uD" },
  { name: "USDC-Depeg",         pubkey: "CcGbU74HpT8sjDU5NDDWFzBPYEARBEfAac4ovDWwgxWU" },
  { name: "Bridge-Hack",        pubkey: "AqKUYemw3A6GbYFnCFwE9S1f1QCfhH4EAjFQCDxyfUtQ" },
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
    fs.readFileSync(
      path.join(__dirname, "../target/idl/myrmex.json"),
      "utf-8"
    )
  );
  const program = new anchor.Program(idl as any, provider);

  console.log("Authority:", admin.publicKey.toBase58());
  console.log("Migrating pool accounts to 227-byte layout...\n");

  for (const pool of CANONICAL_POOLS) {
    const poolPk = new anchor.web3.PublicKey(pool.pubkey);
    try {
      // Check current account size
      const info = await connection.getAccountInfo(poolPk);
      if (!info) {
        console.log(`⚠  ${pool.name}: account not found, skipping`);
        continue;
      }

      if (info.data.length >= 227) {
        console.log(`✓  ${pool.name}: already ${info.data.length} bytes, no migration needed`);
        continue;
      }

      console.log(`→  ${pool.name}: ${info.data.length} bytes → migrating to 227...`);

      const tx = await (program as any).methods
        .migratePool()
        .accounts({
          authority: admin.publicKey,
          pool: poolPk,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      console.log(`✓  ${pool.name}: migrated — tx: ${tx}\n`);
    } catch (e: any) {
      console.error(`✗  ${pool.name}: ${e.message}\n`);
    }
  }

  console.log("Done.");
}

main().catch(console.error);
