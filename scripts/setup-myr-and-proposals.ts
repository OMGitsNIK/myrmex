/**
 * setup-myr-and-proposals.ts
 * ──────────────────────────
 * 1. Creates MYR governance token mint (or reuses stored address)
 * 2. Mints 1000 MYR to admin
 * 3. Stakes 500 MYR so admin can create governance proposals
 * 4. Seeds 3 demo governance proposals (IDs 4, 5, 6)
 *
 * Usage:
 *   ANCHOR_WALLET=~/.config/solana/id.json npx ts-node scripts/setup-myr-and-proposals.ts
 */

import * as anchor from "@coral-xyz/anchor";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import * as fs from "fs";
import * as path from "path";

const PROGRAM_ID = new anchor.web3.PublicKey(
  "9naJhrt9FdAHLwdLnQfgx6citNgEWmW8aLovCS9kYpan"
);
const MYR_MINT_FILE = path.join(__dirname, "../.devnet-myr-mint");

function toFixedBytes(s: string, len: number): number[] {
  const buf = Buffer.alloc(len);
  buf.write(s.slice(0, len - 1), "utf8");
  return Array.from(buf);
}

const PROPOSALS = [
  {
    id: 4,
    title: "Add Wildfire Coverage Pool",
    description:
      "Initialize a new RiskPool backed by NASA FIRMS fire data. Trigger when Fire Radiative Power exceeds threshold in insured region.",
    durationDays: 7,
    actionType: 0,
  },
  {
    id: 5,
    title: "Raise oracle staleness window to 48h",
    description:
      "Current MAX_AGE_SECS = 86400 (24h). Raise to 172800 (48h) for hurricane pool during off-season when NHC may not publish daily updates.",
    durationDays: 5,
    actionType: 1,
  },
  {
    id: 6,
    title: "Reduce minimum premium from 50bps to 30bps",
    description:
      "Stablecoin depeg pool min premium is currently 50bps. Reduce to 30bps to make small cover amounts economically viable for retail users.",
    durationDays: 3,
    actionType: 1,
  },
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

  console.log("Admin:", admin.publicKey.toBase58());

  // ── 1. MYR Mint ──────────────────────────────────────────────────────────
  let myrMint: anchor.web3.PublicKey;

  if (fs.existsSync(MYR_MINT_FILE)) {
    myrMint = new anchor.web3.PublicKey(
      fs.readFileSync(MYR_MINT_FILE, "utf-8").trim()
    );
    console.log("\n✓ Reusing MYR mint:", myrMint.toBase58());
  } else {
    console.log("\n1. Creating MYR mint...");
    myrMint = await createMint(
      connection,
      admin,
      admin.publicKey,     // mint authority
      admin.publicKey,     // freeze authority
      6                    // 6 decimals
    );
    fs.writeFileSync(MYR_MINT_FILE, myrMint.toBase58());
    console.log("   ✓ MYR mint:", myrMint.toBase58());
  }

  // ── 2. Admin MYR ATA + mint tokens ───────────────────────────────────────
  console.log("\n2. Ensuring admin MYR token account...");
  const adminMyrAta = await getOrCreateAssociatedTokenAccount(
    connection,
    admin,
    myrMint,
    admin.publicKey
  );
  console.log("   ✓ Admin MYR ATA:", adminMyrAta.address.toBase58());

  // Mint 1000 MYR to admin (if balance is low)
  if (Number(adminMyrAta.amount) < 500_000_000) {
    await mintTo(
      connection,
      admin,
      myrMint,
      adminMyrAta.address,
      admin,
      1_000_000_000   // 1000 MYR (6 decimals)
    );
    console.log("   ✓ Minted 1000 MYR to admin");
  } else {
    console.log("   ✓ Admin already has MYR tokens");
  }

  // ── 3. Stake MYR ─────────────────────────────────────────────────────────
  const [stakeAccountPda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("stake"), admin.publicKey.toBuffer()],
    PROGRAM_ID
  );

  const existingStake = await connection.getAccountInfo(stakeAccountPda);
  if (!existingStake) {
    console.log("\n3. Staking MYR...");
    const stakeTx = await (program as any).methods
      .stakeMyr(new anchor.BN(500_000_000)) // 500 MYR
      .accounts({
        owner: admin.publicKey,
        stakeAccount: stakeAccountPda,
        myrMint,
        ownerMyr: adminMyrAta.address,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();
    console.log("   ✓ Staked 500 MYR — tx:", stakeTx);
  } else {
    console.log("\n3. Stake account already exists — skipping stake");
  }

  // ── 4. Seed proposals ────────────────────────────────────────────────────
  console.log("\n4. Seeding governance proposals...");

  for (const p of PROPOSALS) {
    const proposalId = new anchor.BN(p.id);
    const [proposalPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("proposal"), proposalId.toArrayLike(Buffer, "le", 8)],
      PROGRAM_ID
    );

    const existing = await connection.getAccountInfo(proposalPda);
    if (existing) {
      console.log(`   ℹ  Proposal #${p.id} already exists — skipping`);
      continue;
    }

    const actionPayload = new Array(64).fill(0);
    const tx = await (program as any).methods
      .createProposal(
        proposalId,
        toFixedBytes(p.title, 64),
        toFixedBytes(p.description, 128),
        new anchor.BN(p.durationDays * 86_400),
        p.actionType,
        actionPayload
      )
      .accounts({
        proposer: admin.publicKey,
        proposerStake: stakeAccountPda,
        proposal: proposalPda,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    console.log(`   ✓  Proposal #${p.id}: "${p.title}" — tx: ${tx}`);
  }

  console.log("\nDone.");
  console.log(`\nMYR_MINT=${myrMint.toBase58()}`);
  console.log("Add this to your .env files.");
}

main().catch(console.error);
