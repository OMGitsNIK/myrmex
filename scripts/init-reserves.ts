/**
 * init-reserves.ts
 * Initializes the reserve_vault token account for all 6 pools.
 * Must be run by the pool authority (admin keypair).
 *
 * Usage:
 *   ANCHOR_WALLET=~/.config/solana/id.json npx ts-node scripts/init-reserves.ts
 */

import * as anchor from "@coral-xyz/anchor";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import * as fs from "fs";
import * as path from "path";

const PROGRAM_ID = new anchor.web3.PublicKey(
  "9naJhrt9FdAHLwdLnQfgx6citNgEWmW8aLovCS9kYpan"
);

const USDC_MINT = new anchor.web3.PublicKey(
  "HM4vdUJGhAbD44G1CDQ7gx6HFUTvaoCgxtkNPXNfP9jo"
);

const POOLS = [
  { name: "Earthquake-Pacific", pubkey: "EHxPZAMvRhumjFeChfeD9bn2Ju1RWf7RM45pY5vzEhNH" },
  { name: "Flood-US-Rivers",    pubkey: "HfyGsQVVsxt6BNM7UzTepBo91DKYdqLy7RKuLrwnM1YY" },
  { name: "Crop-MultiF",        pubkey: "HuPG3dmBftRCAwg71tro7pmp2hjoCT8KWaNtytwUqUo2" },
  { name: "Hurricane-Gulf",     pubkey: "ZZWgmeRUSdQyuarSb2zPFron2x88UgexhTQn8hJr9uD"  },
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
    fs.readFileSync(path.join(__dirname, "../target/idl/myrmex.json"), "utf-8")
  );
  const program = new anchor.Program(idl as any, provider);

  console.log("Authority:", admin.publicKey.toBase58());
  console.log("Initializing reserve vaults...\n");

  for (const pool of POOLS) {
    const poolPk = new anchor.web3.PublicKey(pool.pubkey);

    const [reserveVaultPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("reserve_vault"), poolPk.toBuffer()],
      PROGRAM_ID
    );

    const existing = await connection.getAccountInfo(reserveVaultPda);
    if (existing) {
      console.log(`✓  ${pool.name}: reserve_vault already exists (${reserveVaultPda.toBase58()})`);
      continue;
    }

    try {
      const tx = await (program as any).methods
        .initializeReserve()
        .accounts({
          authority: admin.publicKey,
          pool: poolPk,
          usdcMint: USDC_MINT,
          reserveVault: reserveVaultPda,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      console.log(`✓  ${pool.name}: reserve_vault created — tx: ${tx}`);
    } catch (e: any) {
      console.error(`✗  ${pool.name}: ${e.message}`);
    }
  }

  console.log("\nDone.");
}

main().catch(console.error);
