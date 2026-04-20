"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.policyRouter = void 0;
const express_1 = require("express");
const web3_js_1 = require("@solana/web3.js");
const anchor_service_1 = require("../services/anchor.service");
const router = (0, express_1.Router)();
exports.policyRouter = router;
// GET /api/policies/:wallet
router.get("/:wallet", async (req, res) => {
    try {
        const { program } = (0, anchor_service_1.getAnchorProgram)();
        const wallet = new web3_js_1.PublicKey(req.params.wallet);
        const policies = await program.account.policyVault.all([
            {
                memcmp: {
                    offset: 8, // after discriminator
                    bytes: wallet.toBase58(),
                },
            },
        ]);
        res.json(policies.map(({ publicKey, account }) => {
            const acc = account;
            return {
                pubkey: publicKey.toBase58(),
                account: {
                    policyholder: acc.policyholder.toBase58(),
                    pool: acc.pool.toBase58(),
                    coverageType: acc.coverageType,
                    payoutAmount: acc.payoutAmount.toNumber(),
                    premiumAmount: acc.premiumAmount.toNumber(),
                    triggerCondition: {
                        oraclePubkey: acc.triggerCondition.oraclePubkey.toBase58(),
                        threshold: acc.triggerCondition.threshold.toNumber(),
                        comparison: acc.triggerCondition.comparison,
                    },
                    expiresAt: acc.expiresAt.toNumber(),
                    createdAt: acc.createdAt.toNumber(),
                    isActive: acc.isActive,
                    isClaimed: acc.isClaimed,
                    bump: acc.bump,
                },
            };
        }));
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
