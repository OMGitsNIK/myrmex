import { getAnchorProgram } from "./anchor.service";
import db from "../db/schema";

export function startIndexer() {
  try {
    const { program } = getAnchorProgram();

    program.addEventListener(
      "PolicyCreated",
      (event: any, _slot, signature) => {
        try {
          db.prepare(
            "INSERT OR IGNORE INTO events (event_type, tx_signature, data) VALUES (?, ?, ?)"
          ).run(
            "PolicyCreated",
            signature,
            JSON.stringify({
              policy: event.policy.toBase58(),
              policyholder: event.policyholder.toBase58(),
              pool: event.pool.toBase58(),
              coverage_type: event.coverageType,
              payout_amount: event.payoutAmount.toString(),
              premium_amount: event.premiumAmount.toString(),
              expires_at: event.expiresAt.toString(),
            })
          );
        } catch (err) {
          console.error("[indexer] PolicyCreated insert failed:", err);
        }
      }
    );

    program.addEventListener(
      "PayoutExecuted",
      (event: any, _slot, signature) => {
        try {
          db.prepare(
            "INSERT OR IGNORE INTO events (event_type, tx_signature, data) VALUES (?, ?, ?)"
          ).run(
            "PayoutExecuted",
            signature,
            JSON.stringify({
              policy: event.policy.toBase58(),
              policyholder: event.policyholder.toBase58(),
              payout_amount: event.payoutAmount.toString(),
              oracle_value: event.oracleValue.toString(),
              timestamp: event.timestamp.toString(),
            })
          );
        } catch (err) {
          console.error("[indexer] PayoutExecuted insert failed:", err);
        }
      }
    );

    console.log(
      "[indexer] Structured event listener started for:",
      program.programId.toBase58()
    );
  } catch (e) {
    console.error("[indexer] Failed to start:", e);
  }
}

let statsCache: ReturnType<typeof computeStats> | null = null;
let statsCacheAt = 0;
const STATS_TTL_MS = 60_000;

function computeStats() {
  const events = db
    .prepare("SELECT event_type, data FROM events")
    .all() as any[];

  let totalPremium = 0;
  let totalPayouts = 0;
  let policiesCreated = 0;

  for (const e of events) {
    try {
      const data = JSON.parse(e.data);
      if (e.event_type === "PolicyCreated") {
        totalPremium += parseInt(data.premium_amount || "0", 10);
        policiesCreated++;
      }
      if (e.event_type === "PayoutExecuted") {
        totalPayouts += parseInt(data.payout_amount || "0", 10);
      }
    } catch {
      // ignore malformed rows
    }
  }

  return {
    total_events: events.length,
    policies_created: policiesCreated,
    total_premium_accrued: totalPremium,
    total_payouts_executed: totalPayouts,
    last_sync_time: new Date().toISOString(),
  };
}

export function getStats() {
  const now = Date.now();
  if (statsCache && now - statsCacheAt < STATS_TTL_MS) return statsCache;
  statsCache = computeStats();
  statsCacheAt = now;
  return statsCache;
}

export function bustStatsCache() {
  statsCache = null;
}
