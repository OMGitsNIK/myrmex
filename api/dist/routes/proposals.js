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
// GET /api/proposals — fetch all on-chain GovernanceProposal accounts.
// Filters by dataSize=348 to skip stale pre-migration (274-byte) accounts.
router.get("/", async (_req, res) => {
    try {
        const { program, connection } = (0, anchor_service_1.getAnchorProgram)();
        // GovernanceProposal::LEN = 348
        const rawAccounts = await connection.getProgramAccounts(program.programId, { filters: [{ dataSize: 348 }] });
        const now = Math.floor(Date.now() / 1000);
        const proposals = [];
        for (const { pubkey, account } of rawAccounts) {
            try {
                const d = program.coder.accounts.decode("governanceProposal", account.data);
                const endsAt = d.votingEndsAt.toNumber();
                const status = d.executed
                    ? "executed"
                    : endsAt < now
                        ? d.votesFor.toNumber() > d.votesAgainst.toNumber()
                            ? "passed"
                            : "rejected"
                        : "active";
                proposals.push({
                    pubkey: pubkey.toBase58(),
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
                    effective_at: d.effectiveAt ? d.effectiveAt.toNumber() : 0,
                    status,
                });
            }
            catch (e) {
                // Skip accounts that fail deserialization
                console.warn(`[proposals] skipping ${pubkey.toBase58()}: ${e.message}`);
            }
        }
        proposals.sort((a, b) => b.id - a.id);
        res.json(proposals);
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
