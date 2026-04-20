"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.statsRouter = void 0;
const express_1 = require("express");
const indexer_service_1 = require("../services/indexer.service");
const anchor_service_1 = require("../services/anchor.service");
const router = (0, express_1.Router)();
exports.statsRouter = router;
// GET /api/stats
router.get("/", async (_req, res) => {
    try {
        const { program } = (0, anchor_service_1.getAnchorProgram)();
        const pools = (await program.account.riskPool.all());
        let totalTvl = 0;
        let activePolicies = 0;
        for (const { account } of pools) {
            totalTvl += account.totalLiquidity.toNumber();
            activePolicies += account.activePolicyCount.toNumber();
        }
        const eventStats = (0, indexer_service_1.getStats)();
        res.json({
            total_tvl_usdc: totalTvl,
            active_policies: activePolicies,
            total_pools: pools.length,
            ...eventStats,
        });
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
