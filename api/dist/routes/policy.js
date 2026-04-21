"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.policyByPubkeyRouter = void 0;
const express_1 = require("express");
const web3_js_1 = require("@solana/web3.js");
const anchor_service_1 = require("../services/anchor.service");
const router = (0, express_1.Router)();
exports.policyByPubkeyRouter = router;
// GET /api/policy/:pubkey — fetch a single policy account by its address
router.get("/:pubkey", async (req, res) => {
    try {
        const { program } = (0, anchor_service_1.getAnchorProgram)();
        const pk = new web3_js_1.PublicKey(req.params.pubkey);
        const acc = (await program.account.policyVault.fetch(pk));
        res.json({
            pubkey: pk.toBase58(),
            account: {
                policyholder: acc.policyholder.toBase58(),
                pool: acc.pool.toBase58(),
                coverageType: acc.coverageType,
                payoutAmount: acc.payoutAmount.toNumber(),
                premiumAmount: acc.premiumAmount.toNumber(),
                triggerCondition: {
                    oraclePubkey: acc.triggerCondition.oraclePubkey.toBase58(),
                    scopeHash: Array.from(acc.triggerCondition.scopeHash),
                    threshold: acc.triggerCondition.threshold.toNumber(),
                    comparison: acc.triggerCondition.comparison,
                },
                expiresAt: acc.expiresAt.toNumber(),
                createdAt: acc.createdAt.toNumber(),
                isActive: acc.isActive,
                isClaimed: acc.isClaimed,
                bump: acc.bump,
            },
        });
    }
    catch (e) {
        res.status(404).json({ error: e.message });
    }
});
