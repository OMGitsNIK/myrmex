/**
 * seed-tranche-splits.ts
 * ─────────────────────
 * Retroactively allocates each devnet pool's total_liquidity across
 * junior / mezzanine / senior tranche fields using set_tranche_split.
 * No tokens move — this is purely a bookkeeping migration.
 *
 * Split: 20% junior · 30% mezzanine · 50% senior (2000/3000/5000 bps)
 *
 * Usage:
 *   ANCHOR_WALLET=~/.config/solana/id.json npx ts-node scripts/seed-tranche-splits.ts
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

// 20% junior · 30% mezzanine · 50% senior
const JUNIOR_BPS    = new anchor.BN(2_000);
const MEZZANINE_BPS = new anchor.BN(3_000);
const SENIOR_BPS    = new anchor.BN(5_000);

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
  console.log("Split: 20% junior / 30% mezzanine / 50% senior\n");

  for (const pool of CANONICAL_POOLS) {
    const poolPk = new anchor.web3.PublicKey(pool.pubkey);
    try {
      const poolAccount = await (program as any).account.riskPool.fetch(poolPk);
      const totalLiquidity = poolAccount.totalLiquidity.toNumber();

      if (totalLiquidity === 0) {
        console.log(`⚠  ${pool.name}: total_liquidity=0, skipping`);
        continue;
      }

      if (poolAccount.authority.toBase58() !== admin.publicKey.toBase58()) {
        console.log(`⚠  ${pool.name}: authority mismatch, skipping`);
        continue;
      }

      const tx = await (program as any).methods
        .setTrancheSplit(JUNIOR_BPS, MEZZANINE_BPS, SENIOR_BPS)
        .accounts({ authority: admin.publicKey, pool: poolPk })
        .rpc();

      const junior    = Math.floor(totalLiquidity * 0.20) / 1_000_000;
      const mezzanine = Math.floor(totalLiquidity * 0.30) / 1_000_000;
      const senior    = totalLiquidity / 1_000_000 - junior - mezzanine;

      console.log(`✓  ${pool.name}`);
      console.log(`   junior=$${junior.toFixed(2)} mez=$${mezzanine.toFixed(2)} senior=$${senior.toFixed(2)}`);
      console.log(`   tx: ${tx}\n`);
    } catch (e: any) {
      console.error(`✗  ${pool.name}: ${e.message}`);
    }
  }

  console.log("Done.");
}

main().catch(console.error);
