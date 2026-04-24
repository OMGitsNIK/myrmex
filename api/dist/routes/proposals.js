"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.proposalsRouter = void 0;
const express_1 = require("express");
const anchor_service_1 = require("../services/anchor.service");
const router = (0, express_1.Router)();
exports.proposalsRouter = router;
function parseStr(bytes) {
    return Buffer.from(bytes).toString("utf8").replace(/\0/g, "").trim();
}
// GET /api/proposals — fetch all on-chain GovernanceProposal accounts
router.get("/", async (_req, res) => {
    try {
        const { program } = (0, anchor_service_1.getAnchorProgram)();
        const accounts = await program.account.governanceProposal.all();
        const now = Math.floor(Date.now() / 1000);
        const proposals = accounts
            .map((a) => {
            const d = a.account;
            const endsAt = d.votingEndsAt.toNumber();
            const status = d.executed ? "executed"
                : endsAt < now
                    ? d.votesFor.toNumber() > d.votesAgainst.toNumber() ? "passed" : "rejected"
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
                status,
            };
        })
            .sort((a, b) => b.id - a.id);
        res.json(proposals);
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
