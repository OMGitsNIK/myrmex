/**
 * Seeds governance proposals on devnet.
 * Uses IDs starting at 4 to avoid collision with old-format proposals (1-3).
 * Run: npx ts-node scripts/seed-proposals.ts
 */
import * as anchor from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";

const RPC_URL = "https://api.devnet.solana.com";
const PROGRAM_ID = new PublicKey(
  "9naJhrt9FdAHLwdLnQfgx6citNgEWmW8aLovCS9kYpan"
);

function loadKeypair(): Keypair {
  const keyPath = path.join(process.env.HOME || "~", ".config/solana/id.json");
  return Keypair.fromSecretKey(
    Buffer.from(JSON.parse(fs.readFileSync(keyPath, "utf-8")))
  );
}

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
      "Initialize a new RiskPool (type 6) backed by NASA FIRMS fire data. Trigger when Fire Radiative Power exceeds threshold in insured region. Oracle: NASA FIRMS satellite feed.",
    durationDays: 7,
    actionType: 0,
  },
  {
    id: 5,
    title: "Raise max oracle staleness to 48h",
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
  const kp = loadKeypair();
  const connection = new Connection(RPC_URL, "confirmed");
  const wallet = new anchor.Wallet(kp);
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });

  const idlPath = path.join(__dirname, "../target/idl/myrmex.json");
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf-8"));
  const program = new anchor.Program(idl as any, provider);

  for (const p of PROPOSALS) {
    const proposalId = new anchor.BN(p.id);
    const [proposalPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("proposal"), proposalId.toArrayLike(Buffer, "le", 8)],
      PROGRAM_ID
    );

    const existing = await connection.getAccountInfo(proposalPda);
    if (existing) {
      console.log(`Proposal #${p.id} already exists at ${proposalPda.toBase58()} — skipping`);
      continue;
    }

    // action_payload: 64 zero bytes (no specific action data for these demo proposals)
    const actionPayload = new Array(64).fill(0);

    const sig = await (program as any).methods
      .createProposal(
        proposalId,
        toFixedBytes(p.title, 64),
        toFixedBytes(p.description, 128),
        new anchor.BN(p.durationDays * 86_400),
        p.actionType,
        actionPayload
      )
      .accounts({
        proposer: wallet.publicKey,
        proposal: proposalPda,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    console.log(`✓  Proposal #${p.id} "${p.title}"`);
    console.log(`   PDA: ${proposalPda.toBase58()}`);
    console.log(`   tx:  ${sig}\n`);
  }

  console.log("Done.");
}

main().catch(console.error);
