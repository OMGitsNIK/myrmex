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
const MAX_AGE_SECS = 86400;
const DEFAULT_SCOPE_SEEDS = {
    0: "earthquake:Global",
    1: "flood:Mississippi",
    2: "crop_multifactor:Iowa",
    3: "hurricane:global",
    4: "stablecoin_depeg:usdc-usdt",
    5: "bridge_hack:wormhole-stargate-across",
};
const SOURCE_URLS = {
    0: "https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&minmagnitude=4.5&orderby=magnitude&limit=1",
    1: "https://waterservices.usgs.gov/nwis/iv/?format=json&sites=07010000&parameterCd=00065",
    2: "https://archive-api.open-meteo.com/v1/archive?latitude=41.8781&longitude=-93.0977&daily=precipitation_sum,temperature_2m_max,temperature_2m_min&timezone=auto",
    3: "https://www.nhc.noaa.gov/CurrentStorms.json",
    4: "https://api.coingecko.com/api/v3/simple/price?ids=usd-coin,tether&vs_currencies=usd&precision=6",
    5: "https://api.llama.fi/tvl/wormhole",
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
/**
 * Parses description encoded as "sha256:<64-hex>|<human text>"
 * Returns { sourceHash, humanText } or just humanText if no hash prefix.
 */
function parseDescription(raw) {
    const trimmed = raw.replace(/\0/g, "").trim();
    if (trimmed.startsWith("sha256:") && trimmed[71] === "|") {
        return {
            sourceHash: trimmed.slice(7, 71),
            humanText: trimmed.slice(72),
        };
    }
    return { sourceHash: null, humanText: trimmed };
}
async function fetchReport(poolPk, scopeHash) {
    const { program } = (0, anchor_service_1.getAnchorProgram)();
    const [oracleReportPda] = web3_js_1.PublicKey.findProgramAddressSync([Buffer.from("oracle_report"), poolPk.toBuffer(), scopeHash], PROGRAM_ID);
    const report = await program.account.oracleReport.fetch(oracleReportPda);
    return { report, pda: oracleReportPda };
}
// GET /api/oracle-report/:pool
router.get("/:pool", async (req, res) => {
    try {
        const { program } = (0, anchor_service_1.getAnchorProgram)();
        const poolPk = new web3_js_1.PublicKey(req.params.pool);
        let scopeHash = parseScopeHash(req.query.scope_hash);
        if (!scopeHash) {
            const pool = (await program.account.riskPool.fetch(poolPk));
            scopeHash = scopeHashFromSeed(DEFAULT_SCOPE_SEEDS[pool.poolType] || `pool:${pool.poolType}:default`);
        }
        const { report, pda } = await fetchReport(poolPk, scopeHash);
        const reportedAt = report.reportedAt.toNumber();
        const nowSecs = Math.floor(Date.now() / 1000);
        const age = nowSecs - reportedAt;
        const rawDesc = Buffer.from(report.description).toString("utf8");
        const { sourceHash, humanText } = parseDescription(rawDesc);
        res.json({
            pubkey: pda.toBase58(),
            pool: report.pool.toBase58(),
            authority: report.authority.toBase58(),
            scope_hash: Buffer.from(report.scopeHash).toString("hex"),
            reported_value: report.reportedValue.toNumber(),
            reported_at: reportedAt,
            description: humanText,
            source_hash: sourceHash,
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
// GET /api/oracle-report/:pool/audit
// Returns data provenance info: source hash embedded in the description,
// the source URL, and instructions to independently verify.
router.get("/:pool/audit", async (req, res) => {
    try {
        const { program } = (0, anchor_service_1.getAnchorProgram)();
        const poolPk = new web3_js_1.PublicKey(req.params.pool);
        const pool = (await program.account.riskPool.fetch(poolPk));
        const poolType = pool.poolType;
        const seed = DEFAULT_SCOPE_SEEDS[poolType] || `pool:${poolType}:default`;
        const scopeHash = scopeHashFromSeed(seed);
        const { report, pda } = await fetchReport(poolPk, scopeHash);
        const rawDesc = Buffer.from(report.description).toString("utf8");
        const { sourceHash, humanText } = parseDescription(rawDesc);
        const sourceUrl = SOURCE_URLS[poolType] ?? null;
        res.json({
            pubkey: pda.toBase58(),
            pool: poolPk.toBase58(),
            pool_type: poolType,
            reported_at: report.reportedAt.toNumber(),
            reported_value: report.reportedValue.toNumber(),
            description: humanText,
            source_hash: sourceHash,
            source_url: sourceUrl,
            verify_instructions: sourceHash
                ? `Fetch ${sourceUrl}, compute SHA-256 of the response body. It should match source_hash above.`
                : "This report was posted before source hash provenance was added.",
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
