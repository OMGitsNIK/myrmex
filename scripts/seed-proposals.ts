/**
 * Seeds 3 governance proposals on devnet.
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
    id: 1,
    title: "Add Wildfire Coverage Pool",
    description:
      "Initialize a new RiskPool (type 6) backed by NASA FIRMS fire data. Trigger when Fire Radiative Power exceeds threshold in insured region. Oracle: NASA FIRMS satellite feed.",
    durationDays: 7,
  },
  {
    id: 2,
    title: "Raise max oracle staleness to 48h",
    description:
      "Current MAX_AGE_SECS = 86400 (24h). Raise to 172800 (48h) for hurricane pool during off-season when NHC may not publish updates daily.",
    durationDays: 5,
  },
  {
    id: 3,
    title: "Reduce minimum premium from 50bps to 30bps",
    description:
      "Stablecoin depeg pool min premium is currently 50bps. Reduce to 30bps to make small cover amounts economically viable for retail users.",
    durationDays: 3,
  },
];

async function main() {
  const kp = loadKeypair();
  const connection = new Connection(RPC_URL, "confirmed");
  const wallet = new anchor.Wallet(kp);
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });

  const idlPath = path.join(__dirname, "../api/src/idl/myrmex.json");
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf-8"));
  const program = new anchor.Program(idl, provider);

  for (const p of PROPOSALS) {
    const proposalId = new anchor.BN(p.id);
    const [proposalPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("proposal"), proposalId.toArrayLike(Buffer, "le", 8)],
      PROGRAM_ID
    );

    // Check if already exists
    const existing = await connection.getAccountInfo(proposalPda);
    if (existing) {
      console.log(
        `Proposal #${
          p.id
        } already exists at ${proposalPda.toBase58()} — skipping`
      );
      continue;
    }

    const sig = await (program as any).methods
      .createProposal(
        proposalId,
        toFixedBytes(p.title, 64),
        toFixedBytes(p.description, 128),
        new anchor.BN(p.durationDays * 86_400)
      )
      .accounts({
        proposer: wallet.publicKey,
        proposal: proposalPda,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    console.log(
      `Created proposal #${p.id} "${
        p.title
      }" → ${proposalPda.toBase58()} (tx: ${sig})`
    );
  }

  console.log("Done.");
}

main().catch(console.error);
