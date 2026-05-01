"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pendingPayoutsRouter = void 0;
const express_1 = require("express");
const anchor_service_1 = require("../services/anchor.service");
const router = (0, express_1.Router)();
exports.pendingPayoutsRouter = router;
// GET /api/pending-payouts — all PendingPayout accounts currently on-chain
router.get("/", async (_req, res) => {
    try {
        const { program } = (0, anchor_service_1.getAnchorProgram)();
        const accounts = await program.account.pendingPayout.all();
        const now = Math.floor(Date.now() / 1000);
        const payouts = accounts.map((a) => {
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
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
