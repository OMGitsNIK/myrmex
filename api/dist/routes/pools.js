"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.poolRouter = void 0;
const express_1 = require("express");
const web3_js_1 = require("@solana/web3.js");
const anchor_service_1 = require("../services/anchor.service");
const router = (0, express_1.Router)();
exports.poolRouter = router;
// v2 canonical names by pool type — overrides stale on-chain names
const V2_POOL_NAMES = {
    0: "Earthquake-Pacific",
    1: "Flood-US-Rivers",
    2: "Crop-MultiF",
    3: "Hurricane-Gulf",
    4: "USDC-Depeg",
    5: "Bridge-Hack",
};
const PROGRAM_ID = new web3_js_1.PublicKey(process.env.PROGRAM_ID || "9naJhrt9FdAHLwdLnQfgx6citNgEWmW8aLovCS9kYpan");
// Canonical pool addresses — only these appear in /api/pools.
// Populated from env vars (POOL_TYPE_0 … POOL_TYPE_5) with devnet defaults.
const CANONICAL_POOLS = new Set([
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
        const { program } = (0, anchor_service_1.getAnchorProgram)();
        const allPools = await program.account.riskPool.all();
        // Filter to canonical addresses to prevent spoof pools from appearing
        const pools = allPools.filter(({ publicKey }) => CANONICAL_POOLS.has(publicKey.toBase58()));
        const result = await Promise.all(pools.map(async ({ publicKey, account }) => {
            const acc = account;
            const totalLiquidity = acc.totalLiquidity.toNumber();
            const totalLocked = acc.totalLocked.toNumber();
            const available = totalLiquidity - totalLocked;
            const utilization = totalLiquidity > 0 ? (totalLocked / totalLiquidity) * 100 : 0;
            const premiumAccrued = acc.premiumAccrued.toNumber();
            const estimatedApy = available > 0
                ? ((premiumAccrued / available) * 365 * 100).toFixed(2)
                : "0.00";
            // Fetch pool_config if it exists
            const [poolConfigPda] = web3_js_1.PublicKey.findProgramAddressSync([Buffer.from("pool_config"), publicKey.toBuffer()], PROGRAM_ID);
            let poolConfig = null;
            try {
                const cfg = await program.account.poolConfig.fetch(poolConfigPda);
                poolConfig = {
                    pubkey: poolConfigPda.toBase58(),
                    oracleAuthority: cfg.oracleAuthority.toBase58(),
                    minPremiumBps: cfg.minPremiumBps.toNumber(),
                    maxCoverageBps: cfg.maxCoverageBps.toNumber(),
                };
            }
            catch {
                // pool_config not yet initialized — skip unconfigured pools
                return null;
            }
            return {
                pubkey: publicKey.toBase58(),
                poolType: acc.poolType,
                poolName: V2_POOL_NAMES[acc.poolType] ??
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
        }));
        res.json(result.filter((p) => p !== null));
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
