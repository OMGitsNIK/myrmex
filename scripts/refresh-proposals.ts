/**
 * refresh-proposals.ts
 * Creates new governance proposals (IDs 7, 8, 9) with 30-day voting windows
 * and casts votes on them so they show as active with real vote counts.
 */
import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";

const PROGRAM_ID = new PublicKey("9naJhrt9FdAHLwdLnQfgx6citNgEWmW8aLovCS9kYpan");

function toFixedBytes(s: string, len: number): number[] {
  const buf = Buffer.alloc(len);
  buf.write(s.slice(0, len - 1), "utf8");
  return Array.from(buf);
}

const PROPOSALS = [
  {
    id: 7,
    title: "Add Wildfire Coverage Pool",
    description:
      "Initialize a new RiskPool backed by NASA FIRMS fire data. Trigger when Fire Radiative Power exceeds threshold in insured region. Oracle: NASA FIRMS satellite feed.",
    durationDays: 30,
    actionType: 0,
    voteFor: true,
  },
  {
    id: 8,
    title: "Raise oracle staleness window to 48h",
    description:
      "Current MAX_AGE_SECS = 86400 (24h). Raise to 172800 (48h) for hurricane pool during off-season when NHC may not publish daily updates.",
    durationDays: 30,
    actionType: 1,
    voteFor: true,
  },
  {
    id: 9,
    title: "Reduce minimum premium from 50bps to 30bps",
    description:
      "Stablecoin depeg pool min premium is currently 50bps. Reduce to 30bps to make small cover amounts economically viable for retail users.",
    durationDays: 30,
    actionType: 1,
    voteFor: false,
  },
];

async function main() {
  const keypairPath =
    process.env.ANCHOR_WALLET ||
    path.join(process.env.HOME || "~", ".config/solana/id.json");

  const admin = anchor.web3.Keypair.fromSecretKey(
    Buffer.from(JSON.parse(fs.readFileSync(keypairPath, "utf-8")))
  );

  const connection = new anchor.web3.Connection("https://api.devnet.solana.com", "confirmed");
  const wallet = new anchor.Wallet(admin);
  const provider = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });
  anchor.setProvider(provider);

  const idl = JSON.parse(fs.readFileSync(path.join(__dirname, "../target/idl/myrmex.json"), "utf-8"));
  const program = new anchor.Program(idl as any, provider);

  const [stakeAccountPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("stake"), admin.publicKey.toBuffer()],
    PROGRAM_ID
  );

  const stakeInfo = await connection.getAccountInfo(stakeAccountPda);
  if (!stakeInfo) {
    console.error("No stake account found — run setup-myr-and-proposals.ts first");
    process.exit(1);
  }
  console.log("Admin:", admin.publicKey.toBase58());
  console.log("Stake account:", stakeAccountPda.toBase58(), "\n");

  for (const p of PROPOSALS) {
    const proposalId = new anchor.BN(p.id);
    const [proposalPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("proposal"), proposalId.toArrayLike(Buffer, "le", 8)],
      PROGRAM_ID
    );

    const existing = await connection.getAccountInfo(proposalPda);
    if (existing) {
      console.log(`  Proposal #${p.id} already exists — skipping creation`);
    } else {
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
      console.log(`✓  Created proposal #${p.id}: "${p.title}" — tx: ${tx.slice(0, 20)}…`);
    }

    // Cast vote
    const [voteReceiptPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("vote_receipt"), proposalPda.toBuffer(), admin.publicKey.toBuffer()],
      PROGRAM_ID
    );
    const alreadyVoted = await connection.getAccountInfo(voteReceiptPda);
    if (alreadyVoted) {
      console.log(`  Already voted on #${p.id} — skipping`);
    } else {
      const voteTx = await (program as any).methods
        .castVote(proposalId, p.voteFor)
        .accounts({
          voter: admin.publicKey,
          voterStake: stakeAccountPda,
          proposal: proposalPda,
          voteReceipt: voteReceiptPda,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
      console.log(`✓  Voted ${p.voteFor ? "FOR" : "AGAINST"} #${p.id} — tx: ${voteTx.slice(0, 20)}…`);
    }
  }

  console.log("\nDone.");
}

main().catch(console.error);
