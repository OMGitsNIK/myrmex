"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startIndexer = startIndexer;
exports.getStats = getStats;
const anchor_service_1 = require("./anchor.service");
const schema_1 = __importDefault(require("../db/schema"));
function startIndexer() {
    try {
        const { program } = (0, anchor_service_1.getAnchorProgram)();
        program.addEventListener("PolicyCreated", (event, _slot, signature) => {
            try {
                schema_1.default.prepare("INSERT OR IGNORE INTO events (event_type, tx_signature, data) VALUES (?, ?, ?)").run("PolicyCreated", signature, JSON.stringify({
                    policy: event.policy.toBase58(),
                    policyholder: event.policyholder.toBase58(),
                    pool: event.pool.toBase58(),
                    coverage_type: event.coverageType,
                    payout_amount: event.payoutAmount.toString(),
                    premium_amount: event.premiumAmount.toString(),
                    expires_at: event.expiresAt.toString(),
                }));
            }
            catch (err) {
                console.error("[indexer] PolicyCreated insert failed:", err);
            }
        });
        program.addEventListener("PayoutExecuted", (event, _slot, signature) => {
            try {
                schema_1.default.prepare("INSERT OR IGNORE INTO events (event_type, tx_signature, data) VALUES (?, ?, ?)").run("PayoutExecuted", signature, JSON.stringify({
                    policy: event.policy.toBase58(),
                    policyholder: event.policyholder.toBase58(),
                    payout_amount: event.payoutAmount.toString(),
                    oracle_value: event.oracleValue.toString(),
                    timestamp: event.timestamp.toString(),
                }));
            }
            catch (err) {
                console.error("[indexer] PayoutExecuted insert failed:", err);
            }
        });
        console.log("[indexer] Structured event listener started for:", program.programId.toBase58());
    }
    catch (e) {
        console.error("[indexer] Failed to start:", e);
    }
}
function getStats() {
    const events = schema_1.default
        .prepare("SELECT event_type, data FROM events")
        .all();
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
        }
        catch {
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
