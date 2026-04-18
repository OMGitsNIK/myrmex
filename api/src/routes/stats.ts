import { Router } from "express";
import { getStats } from "../services/indexer.service";
import { getAnchorProgram } from "../services/anchor.service";

const router = Router();

// GET /api/stats
router.get("/", async (_req, res) => {
  try {
    const { program } = getAnchorProgram();
    const pools = (await (program as any).account.riskPool.all()) as any[];

    let totalTvl = 0;
    let activePolicies = 0;
    for (const { account } of pools) {
      totalTvl += account.totalLiquidity.toNumber();
      activePolicies += account.activePolicyCount.toNumber();
    }

    const eventStats = getStats();

    res.json({
      total_tvl_usdc: totalTvl,
      active_policies: activePolicies,
      total_pools: pools.length,
      ...eventStats,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export { router as statsRouter };
