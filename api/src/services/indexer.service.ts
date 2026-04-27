import { PublicKey } from "@solana/web3.js";
import { getAnchorProgram } from "./anchor.service";
import db from "../db/schema";

export function startIndexer() {
  try {
    const { program } = getAnchorProgram();
    const programId = program.programId;

    // Robust Event Indexing using Anchor's addEventListener
    program.addEventListener("PolicyCreated", (event: any, slot, signature) => {
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

        // Also update/sync the policies table for quick lookups
        db.prepare(
          `
          INSERT INTO policies (pubkey, policyholder, pool, coverage_type, payout_amount, premium_amount, expires_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(pubkey) DO UPDATE SET is_active=1
        `
        ).run(
          event.policy.toBase58(),
          event.policyholder.toBase58(),
          event.pool.toBase58(),
          event.coverageType,
          event.payoutAmount.toNumber(),
          event.premiumAmount.toNumber(),
          event.expiresAt.toNumber()
        );
      } catch (err) {
        console.error("Failed to index PolicyCreated event:", err);
      }
    });

    // PayoutExecuted event handling
    program.addEventListener("PayoutExecuted", (event: any, slot, signature) => {
      db.prepare(
        "INSERT OR IGNORE INTO events (event_type, tx_signature, data) VALUES (?, ?, ?)"
      ).run("PayoutExecuted", signature, JSON.stringify(event));
    });

    console.log("Structured event indexer started for:", programId.toBase58());
  } catch (e) {
    console.error("Indexer failed to start:", e);
  }
}

export function getStats() {
  const events = db
    .prepare("SELECT event_type, data FROM events")
    .all() as any[];

  let totalPremium = 0;
  let totalPayouts = 0;
  let activePolicies = 0;

  events.forEach((e) => {
    try {
      const data = JSON.parse(e.data);
      if (e.event_type === "PolicyCreated") {
        totalPremium += parseInt(data.premium_amount || 0);
        activePolicies++;
      }
      if (e.event_type === "PayoutExecuted") {
        totalPayouts += parseInt(data.payout_amount || 0);
      }
    } catch {}
  });

  return {
    total_events: events.length,
    policies_created: activePolicies,
    total_premium_accrued: totalPremium,
    total_payouts_executed: totalPayouts,
    last_sync_time: new Date().toISOString(),
  };
}
