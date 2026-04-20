import { Router } from "express";
import { PublicKey } from "@solana/web3.js";
import { getAnchorProgram } from "../services/anchor.service";

const router = Router();

const PROGRAM_ID = new PublicKey(
  process.env.PROGRAM_ID || "9naJhrt9FdAHLwdLnQfgx6citNgEWmW8aLovCS9kYpan"
);

const MAX_AGE_SECS = 86_400; // 24h — must match OracleReport::MAX_AGE_SECS in Rust

// GET /api/oracle-report/:pool
// Returns the current oracle report for a pool, if it exists.
router.get("/:pool", async (req, res) => {
  try {
    const { program } = getAnchorProgram();
    const poolPk = new PublicKey(req.params.pool);

    const [oracleReportPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("oracle_report"), poolPk.toBuffer()],
      PROGRAM_ID
    );

    const report = await (program as any).account.oracleReport.fetch(
      oracleReportPda
    );

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
  } catch (e: any) {
    if (e.message?.includes("Account does not exist")) {
      res.status(404).json({ error: "No oracle report found for this pool" });
    } else {
      res.status(500).json({ error: e.message });
    }
  }
});

export { router as oracleRouter };
