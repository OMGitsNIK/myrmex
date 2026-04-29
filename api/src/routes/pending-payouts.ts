import { Router } from "express";
import { getAnchorProgram } from "../services/anchor.service";

const router = Router();

// GET /api/pending-payouts — all PendingPayout accounts currently on-chain
router.get("/", async (_req, res) => {
  try {
    const { program } = getAnchorProgram();
    const accounts = await (program as any).account.pendingPayout.all();
    const now = Math.floor(Date.now() / 1000);

    const payouts = accounts.map((a: any) => {
      const d = a.account;
      const executeAfter = d.executeAfter?.toNumber() ?? d.execute_after?.toNumber() ?? 0;
      return {
        pubkey: a.publicKey.toBase58(),
        policy: d.policy.toBase58(),
        pool: d.pool.toBase58(),
        policyholder: d.policyholder.toBase58(),
        amount: d.amount.toNumber(),
        execute_after: executeAfter,
        vetoed: d.vetoed,
        ready: now >= executeAfter,
        seconds_remaining: Math.max(0, executeAfter - now),
      };
    });

    res.json(payouts);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export { router as pendingPayoutsRouter };
