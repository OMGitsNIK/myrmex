import { Router } from "express";
import { PublicKey } from "@solana/web3.js";
import { getAnchorProgram } from "../services/anchor.service";

const router = Router();

const PROGRAM_ID = new PublicKey(
  process.env.PROGRAM_ID || "9naJhrt9FdAHLwdLnQfgx6citNgEWmW8aLovCS9kYpan"
);

// GET /api/pools
router.get("/", async (_req, res) => {
  try {
    const { program } = getAnchorProgram();
    const pools = await (program as any).account.riskPool.all();

    const result = await Promise.all(
      pools.map(async ({ publicKey, account }) => {
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

        // Fetch pool_config if it exists
        const [poolConfigPda] = PublicKey.findProgramAddressSync(
          [Buffer.from("pool_config"), publicKey.toBuffer()],
          PROGRAM_ID
        );
        let poolConfig: Record<string, any> | null = null;
        try {
          const cfg = await (program as any).account.poolConfig.fetch(
            poolConfigPda
          );
          poolConfig = {
            pubkey: poolConfigPda.toBase58(),
            oracleAuthority: cfg.oracleAuthority.toBase58(),
            minPremiumBps: cfg.minPremiumBps.toNumber(),
            maxCoverageBps: cfg.maxCoverageBps.toNumber(),
          };
        } catch {
          // pool_config not yet initialized
        }

        return {
          pubkey: publicKey.toBase58(),
          poolType: acc.poolType,
          poolName: Buffer.from(acc.poolName)
            .toString("utf8")
            .replace(/\0/g, "")
            .trim(),
          totalLiquidity,
          totalLocked,
          available,
          utilizationPct: utilization.toFixed(2),
          estimatedApy,
          activePolicies: acc.activePolicyCount.toNumber(),
          isActive: acc.isActive,
          vault: acc.vault.toBase58(),
          usdcMint: acc.usdcMint.toBase58(),
          lpTokenMint: acc.lpTokenMint.toBase58(),
          poolConfig,
        };
      })
    );

    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export { router as poolRouter };
