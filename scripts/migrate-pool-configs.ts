/**
 * migrate-pool-configs.ts
 * ────────────────────────
 * Extends existing devnet PoolConfig accounts from 89 bytes to 98 bytes,
 * adding reserve_balance and demo_mode fields (demo_mode set to true).
 *
 * Usage:
 *   ANCHOR_WALLET=~/.config/solana/id.json npx ts-node scripts/migrate-pool-configs.ts
 */

import * as anchor from "@coral-xyz/anchor";
import * as fs from "fs";
import * as path from "path";

const PROGRAM_ID = new anchor.web3.PublicKey(
  "9naJhrt9FdAHLwdLnQfgx6citNgEWmW8aLovCS9kYpan"
);

const CANONICAL_POOL_CONFIGS = [
  { name: "Earthquake-Pacific", pubkey: "CedW89dqKMVUTxsQpnndobSJszfkBtbwgU7YJYmvSsmJ" },
  { name: "Flood-US-Rivers",    pubkey: "24FUmChFjxqge4R5tQwucGZG2zrtsZa57amDTK6XZtXh" },
  { name: "Crop-MultiF",        pubkey: "6PyN45UM9wcvEUsp5f4BoBWJEqAxfbYumSNf2DPwZ9Bj" },
  { name: "Hurricane-Gulf",     pubkey: "5zCLCAuVudj3VJ9mFraga9ceLrL8qW3vpP9QVEaLHc7Y" },
  { name: "USDC-Depeg",         pubkey: "BFQ2nKGoaLUkoGJPB32KMaMa8yNPL5UGQNHjC76Crdic" },
  { name: "Bridge-Hack",        pubkey: "fQj88u7savf8sDVE17CAX8i6V1k5Qi8G9e5ohTAJ6iS" },
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

  console.log("Authority:", admin.publicKey.toBase58());
  console.log("Migrating pool_config accounts to 98-byte layout...\n");

  for (const cfg of CANONICAL_POOL_CONFIGS) {
    const cfgPk = new anchor.web3.PublicKey(cfg.pubkey);

    const info = await connection.getAccountInfo(cfgPk);
    if (!info) {
      console.log(`⚠  ${cfg.name}: account not found`);
      continue;
    }

    if (info.data.length >= 98) {
      console.log(`✓  ${cfg.name}: already ${info.data.length} bytes`);
      continue;
    }

    console.log(`→  ${cfg.name}: ${info.data.length} bytes → migrating to 98...`);

    try {
      const tx = await (program as any).methods
        .migratePoolConfig()
        .accounts({
          authority: admin.publicKey,
          poolConfig: cfgPk,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      console.log(`✓  ${cfg.name}: migrated — tx: ${tx}\n`);
    } catch (e: any) {
      console.error(`✗  ${cfg.name}: ${e.message}\n`);
    }
  }

  console.log("Done.");
}

main().catch(console.error);
