"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.oracleRouter = void 0;
const express_1 = require("express");
const web3_js_1 = require("@solana/web3.js");
const crypto_1 = require("crypto");
const anchor_service_1 = require("../services/anchor.service");
const router = (0, express_1.Router)();
exports.oracleRouter = router;
const PROGRAM_ID = new web3_js_1.PublicKey(process.env.PROGRAM_ID || "9naJhrt9FdAHLwdLnQfgx6citNgEWmW8aLovCS9kYpan");
const MAX_AGE_SECS = 86400; // 24h — must match OracleReport::MAX_AGE_SECS in Rust
const DEFAULT_SCOPE_SEEDS = {
    0: "earthquake:Global",
    1: "flood:Mississippi",
    2: "crop_multifactor:Iowa",
    3: "hurricane:global",
    4: "stablecoin_depeg:usdc-usdt",
    5: "bridge_hack:wormhole-stargate-across",
};
function scopeHashFromSeed(seed) {
    return (0, crypto_1.createHash)("sha256").update(seed).digest();
}
function parseScopeHash(hex) {
    if (!hex)
        return null;
    const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
    if (!/^[0-9a-fA-F]{64}$/.test(clean))
        return null;
    return Buffer.from(clean, "hex");
}
// GET /api/oracle-report/:pool
// Returns the current oracle report for a pool, if it exists.
router.get("/:pool", async (req, res) => {
    try {
        const { program } = (0, anchor_service_1.getAnchorProgram)();
        const poolPk = new web3_js_1.PublicKey(req.params.pool);
        let scopeHash = parseScopeHash(req.query.scope_hash);
        if (!scopeHash) {
            const pool = (await program.account.riskPool.fetch(poolPk));
            scopeHash = scopeHashFromSeed(DEFAULT_SCOPE_SEEDS[pool.poolType] || `pool:${pool.poolType}:default`);
        }
        const [oracleReportPda] = web3_js_1.PublicKey.findProgramAddressSync([Buffer.from("oracle_report"), poolPk.toBuffer(), scopeHash], PROGRAM_ID);
        const report = await program.account.oracleReport.fetch(oracleReportPda);
        const reportedAt = report.reportedAt.toNumber();
        const nowSecs = Math.floor(Date.now() / 1000);
        const age = nowSecs - reportedAt;
        res.json({
            pubkey: oracleReportPda.toBase58(),
            pool: report.pool.toBase58(),
            authority: report.authority.toBase58(),
            scope_hash: Buffer.from(report.scopeHash).toString("hex"),
            reported_value: report.reportedValue.toNumber(),
            reported_at: reportedAt,
            description: Buffer.from(report.description).toString("utf8").replace(/\0/g, "").trim(),
            age_secs: age,
            is_fresh: age <= MAX_AGE_SECS,
        });
    }
    catch (e) {
        if (e.message?.includes("Account does not exist")) {
            res.status(404).json({ error: "No oracle report found for this pool" });
        }
        else {
            res.status(500).json({ error: e.message });
        }
    }
});
