import { Router } from "express";
import { getAnchorProgram } from "../services/anchor.service";

const router = Router();

function parseStr(bytes: number[]): string {
  return Buffer.from(bytes).toString("utf8").replace(/\0/g, "").trim();
}

// GET /api/proposals — fetch all on-chain GovernanceProposal accounts
router.get("/", async (_req, res) => {
  try {
    const { program } = getAnchorProgram();
    const accounts = await (program as any).account.governanceProposal.all();
    const now = Math.floor(Date.now() / 1000);

    const proposals = accounts
      .map((a: any) => {
        const d = a.account;
        const endsAt = d.votingEndsAt.toNumber();
        const status = d.executed
          ? "executed"
          : endsAt < now
          ? d.votesFor.toNumber() > d.votesAgainst.toNumber()
            ? "passed"
            : "rejected"
          : "active";
        return {
          pubkey: a.publicKey.toBase58(),
          id: d.id.toNumber(),
          proposer: d.proposer.toBase58(),
          title: parseStr(d.title),
          description: parseStr(d.description),
          votes_for: d.votesFor.toNumber(),
          votes_against: d.votesAgainst.toNumber(),
          created_at: d.createdAt.toNumber(),
          voting_ends_at: endsAt,
          executed: d.executed,
          queued: d.queued ?? false,
          effective_at: d.effectiveAt?.toNumber() ?? 0,
          status,
        };
      })
      .sort((a: any, b: any) => b.id - a.id);

    res.json(proposals);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export { router as proposalsRouter };
