"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.poolRouter = void 0;
const express_1 = require("express");
const web3_js_1 = require("@solana/web3.js");
const anchor_service_1 = require("../services/anchor.service");
const router = (0, express_1.Router)();
exports.poolRouter = router;
const PROGRAM_ID = new web3_js_1.PublicKey(process.env.PROGRAM_ID || "9naJhrt9FdAHLwdLnQfgx6citNgEWmW8aLovCS9kYpan");
// GET /api/pools
router.get("/", async (_req, res) => {
    try {
        const { program } = (0, anchor_service_1.getAnchorProgram)();
        const pools = await program.account.riskPool.all();
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
                lpTokenMint: acc.lpTokenMint.toBase58(),
                poolConfig,
            };
        }));
        res.json(result);
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
