import { Router } from "express";
import { getAnchorProgram } from "../services/anchor.service";

const router = Router();

// GET /api/pools
router.get("/", async (_req, res) => {
  try {
    const { program } = getAnchorProgram();
    const pools = await (program as any).account.riskPool.all();

    const result = pools.map(({ publicKey, account }) => {
      const acc = account as any;
      const totalLiquidity = acc.totalLiquidity.toNumber();
      const totalLocked = acc.totalLocked.toNumber();
      const available = totalLiquidity - totalLocked;
      const utilization =
        totalLiquidity > 0 ? (totalLocked / totalLiquidity) * 100 : 0;
      const premiumAccrued = acc.premiumAccrued.toNumber();
      const estimatedApy =
        available > 0
          ? ((premiumAccrued / available) * 365 * 100).toFixed(2)
          : "0.00";

      return {
        pubkey: publicKey.toBase58(),
        poolType: acc.poolType,
        totalLiquidity,
        totalLocked,
        available,
        utilizationPct: utilization.toFixed(2),
        estimatedApy,
        activePolicies: acc.activePolicyCount.toNumber(),
        isActive: acc.isActive,
      };
    });

    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export { router as poolRouter };
