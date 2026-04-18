import { PublicKey } from "@solana/web3.js";
import { getAnchorProgram } from "./anchor.service";
import db from "../db/schema";

export function startIndexer() {
  try {
    const { provider } = getAnchorProgram();
    const connection = provider.connection;
    const programId = new PublicKey(
      process.env.PROGRAM_ID || "9naJhrt9FdAHLwdLnQfgx6citNgEWmW8aLovCS9kYpan"
    );

    connection.onLogs(programId, (logs) => {
      if (logs.err) return;
      logs.logs.forEach((log) => {
        if (log.includes("PolicyCreated")) {
          db.prepare(
            "INSERT OR IGNORE INTO events (event_type, tx_signature, data) VALUES (?, ?, ?)"
          ).run("PolicyCreated", logs.signature, log);
        }
        if (log.includes("PayoutExecuted")) {
          db.prepare(
            "INSERT OR IGNORE INTO events (event_type, tx_signature, data) VALUES (?, ?, ?)"
          ).run("PayoutExecuted", logs.signature, log);
        }
        if (log.includes("PoolFunded")) {
          db.prepare(
            "INSERT OR IGNORE INTO events (event_type, tx_signature, data) VALUES (?, ?, ?)"
          ).run("PoolFunded", logs.signature, log);
        }
      });
    });

    console.log("Event indexer started, listening to:", programId.toBase58());
  } catch (e) {
    console.error("Indexer failed to start:", e);
  }
}

export function getStats() {
  const total = (db.prepare("SELECT COUNT(*) as n FROM events").get() as any).n;
  const payouts = (
    db
      .prepare(
        "SELECT COUNT(*) as n FROM events WHERE event_type = 'PayoutExecuted'"
      )
      .get() as any
  ).n;
  const policies = (
    db
      .prepare(
        "SELECT COUNT(*) as n FROM events WHERE event_type = 'PolicyCreated'"
      )
      .get() as any
  ).n;
  return {
    total_events: total,
    payouts_executed: payouts,
    policies_created: policies,
  };
}
