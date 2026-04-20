"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.oracleRouter = void 0;
const express_1 = require("express");
const web3_js_1 = require("@solana/web3.js");
const anchor_service_1 = require("../services/anchor.service");
const router = (0, express_1.Router)();
exports.oracleRouter = router;
const PROGRAM_ID = new web3_js_1.PublicKey(process.env.PROGRAM_ID || "9naJhrt9FdAHLwdLnQfgx6citNgEWmW8aLovCS9kYpan");
const MAX_AGE_SECS = 86400; // 24h — must match OracleReport::MAX_AGE_SECS in Rust
// GET /api/oracle-report/:pool
// Returns the current oracle report for a pool, if it exists.
router.get("/:pool", async (req, res) => {
    try {
        const { program } = (0, anchor_service_1.getAnchorProgram)();
        const poolPk = new web3_js_1.PublicKey(req.params.pool);
        const [oracleReportPda] = web3_js_1.PublicKey.findProgramAddressSync([Buffer.from("oracle_report"), poolPk.toBuffer()], PROGRAM_ID);
        const report = await program.account.oracleReport.fetch(oracleReportPda);
        const reportedAt = report.reportedAt.toNumber();
        const nowSecs = Math.floor(Date.now() / 1000);
        const age = nowSecs - reportedAt;
        res.json({
            pubkey: oracleReportPda.toBase58(),
            pool: report.pool.toBase58(),
            authority: report.authority.toBase58(),
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
