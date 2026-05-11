import { Router } from "express";
import { PublicKey } from "@solana/web3.js";
import { getAnchorProgram } from "../services/anchor.service";

const router = Router();

function parseStr(bytes: number[]): string {
  return Buffer.from(bytes).toString("utf8").replace(/\0/g, "").trim();
}

// GET /api/proposals — fetch all on-chain GovernanceProposal accounts.
// Filters by dataSize=348 to skip stale pre-migration (274-byte) accounts.
router.get("/", async (_req, res) => {
  try {
    const { program, connection } = getAnchorProgram();

    // GovernanceProposal::LEN = 348
    const rawAccounts = await connection.getProgramAccounts(
      program.programId,
      { filters: [{ dataSize: 348 }] }
    );

    const now = Math.floor(Date.now() / 1000);
    const proposals: any[] = [];

    for (const { pubkey, account } of rawAccounts) {
      try {
        const d = (program as any).coder.accounts.decode(
          "governanceProposal",
          account.data
        );
        const endsAt = (d.votingEndsAt as any).toNumber();
        const status = d.executed
          ? "executed"
          : endsAt < now
          ? (d.votesFor as any).toNumber() > (d.votesAgainst as any).toNumber()
            ? "passed"
            : "rejected"
          : "active";

        proposals.push({
          pubkey: pubkey.toBase58(),
          id: (d.id as any).toNumber(),
          proposer: (d.proposer as PublicKey).toBase58(),
          title: parseStr(d.title),
          description: parseStr(d.description),
          votes_for: (d.votesFor as any).toNumber(),
          votes_against: (d.votesAgainst as any).toNumber(),
          created_at: (d.createdAt as any).toNumber(),
          voting_ends_at: endsAt,
          executed: d.executed,
          queued: d.queued ?? false,
          effective_at: d.effectiveAt ? (d.effectiveAt as any).toNumber() : 0,
          status,
        });
      } catch (e: any) {
        // Skip accounts that fail deserialization
        console.warn(`[proposals] skipping ${pubkey.toBase58()}: ${e.message}`);
      }
    }

    proposals.sort((a, b) => b.id - a.id);
    // Filter out zero-vote rejected proposals (stale pre-migration accounts)
    const filtered = proposals.filter(
      (p) => p.status !== "rejected" || p.votes_for > 0 || p.votes_against > 0
    );
    res.json(filtered);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export { router as proposalsRouter };
