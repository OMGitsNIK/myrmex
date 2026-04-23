import { Router } from "express";
import { PublicKey } from "@solana/web3.js";
import { createHash } from "crypto";
import { getAnchorProgram } from "../services/anchor.service";

const router = Router();

const PROGRAM_ID = new PublicKey(
  process.env.PROGRAM_ID || "9naJhrt9FdAHLwdLnQfgx6citNgEWmW8aLovCS9kYpan"
);

const MAX_AGE_SECS = 86_400; // 24h — must match OracleReport::MAX_AGE_SECS in Rust

const DEFAULT_SCOPE_SEEDS: Record<number, string> = {
  0: "earthquake:Global",
  1: "flood:Mississippi",
  2: "crop_multifactor:Iowa",
  3: "hurricane:global",
  4: "stablecoin_depeg:usdc-usdt",
  5: "bridge_hack:wormhole-stargate-across",
};

function scopeHashFromSeed(seed: string): Buffer {
  return createHash("sha256").update(seed).digest();
}

function parseScopeHash(hex?: string): Buffer | null {
  if (!hex) return null;
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (!/^[0-9a-fA-F]{64}$/.test(clean)) return null;
  return Buffer.from(clean, "hex");
}

// GET /api/oracle-report/:pool
// Returns the current oracle report for a pool, if it exists.
router.get("/:pool", async (req, res) => {
  try {
    const { program } = getAnchorProgram();
    const poolPk = new PublicKey(req.params.pool);
    let scopeHash = parseScopeHash(req.query.scope_hash as string | undefined);

    if (!scopeHash) {
      const pool = (await (program as any).account.riskPool.fetch(
        poolPk
      )) as any;
      scopeHash = scopeHashFromSeed(
        DEFAULT_SCOPE_SEEDS[pool.poolType] || `pool:${pool.poolType}:default`
      );
    }

    const [oracleReportPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("oracle_report"), poolPk.toBuffer(), scopeHash],
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
      scope_hash: Buffer.from(report.scopeHash).toString("hex"),
      reported_value: report.reportedValue.toNumber(),
      reported_at: reportedAt,
      description: Buffer.from(report.description)
        .toString("utf8")
        .replace(/\0/g, "")
        .trim(),
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
