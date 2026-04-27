import { Router } from "express";
import { PublicKey } from "@solana/web3.js";
import { getAnchorProgram } from "../services/anchor.service";

const router = Router();

// v2 canonical names by pool type — overrides stale on-chain names
const V2_POOL_NAMES: Record<number, string> = {
  0: "Earthquake-Pacific",
  1: "Flood-US-Rivers",
  2: "Crop-MultiF",
  3: "Hurricane-Gulf",
  4: "USDC-Depeg",
  5: "Bridge-Hack",
};

const PROGRAM_ID = new PublicKey(
  process.env.PROGRAM_ID || "9naJhrt9FdAHLwdLnQfgx6citNgEWmW8aLovCS9kYpan"
);

// Canonical pool addresses — only these appear in /api/pools.
// Populated from env vars (POOL_TYPE_0 … POOL_TYPE_5) with devnet defaults.
const CANONICAL_POOLS = new Set<string>([
  process.env.POOL_TYPE_0 || "EHxPZAMvRhumjFeChfeD9bn2Ju1RWf7RM45pY5vzEhNH",
  process.env.POOL_TYPE_1 || "HfyGsQVVsxt6BNM7UzTepBo91DKYdqLy7RKuLrwnM1YY",
  process.env.POOL_TYPE_2 || "HuPG3dmBftRCAwg71tro7pmp2hjoCT8KWaNtytwUqUo2",
  process.env.POOL_TYPE_3 || "ZZWgmeRUSdQyuarSb2zPFron2x88UgexhTQn8hJr9uD",
  process.env.POOL_TYPE_4 || "CcGbU74HpT8sjDU5NDDWFzBPYEARBEfAac4ovDWwgxWU",
  process.env.POOL_TYPE_5 || "AqKUYemw3A6GbYFnCFwE9S1f1QCfhH4EAjFQCDxyfUtQ",
]);

// GET /api/pools
router.get("/", async (_req, res) => {
  try {
    const { program } = getAnchorProgram();
    const allPools = await (program as any).account.riskPool.all();

    // Strict Filtering:
    // 1. Must be in the canonical list
    // 2. Must have a valid pool_config (enforced below)
    const pools = allPools.filter(({ publicKey }: { publicKey: PublicKey }) =>
      CANONICAL_POOLS.has(publicKey.toBase58())
    );

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

        // Fetch pool_config
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
            pricingAuthority: cfg.pricingAuthority.toBase58(),
            minPremiumBps: cfg.minPremiumBps.toNumber(),
            maxCoverageBps: cfg.maxCoverageBps.toNumber(),
          };
        } catch {
          // pool_config not yet initialized — in strict mode, we might want to skip this pool
          return null;
        }

        return {
          pubkey: publicKey.toBase58(),
          poolType: acc.poolType,
          poolName:
            V2_POOL_NAMES[acc.poolType] ??
            Buffer.from(acc.poolName)
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

    // Filter out nulls from missing configs
    res.json(result.filter((p) => p !== null));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export { router as poolRouter };
