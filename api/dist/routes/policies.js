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
        const { program, connection } = (0, anchor_service_1.getAnchorProgram)();
        const wallet = new web3_js_1.PublicKey(req.params.wallet);
        // Fetch all PolicyVault accounts for this wallet regardless of size,
        // then decode per-account so old-format accounts are silently skipped.
        const rawAccounts = await connection.getProgramAccounts(program.programId, {
            filters: [{ memcmp: { offset: 8, bytes: wallet.toBase58() } }],
        });
        const results = [];
        for (const { pubkey, account } of rawAccounts) {
            try {
                const decoded = program.coder.accounts.decode("policyVault", account.data);
                const acc = decoded;
                results.push({
                    pubkey: pubkey.toBase58(),
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
            catch {
                // Skip accounts that fail deserialization (old format, corrupted, etc.)
            }
        }
        res.json(results);
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
