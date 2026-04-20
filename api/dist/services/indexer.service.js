"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startIndexer = startIndexer;
exports.getStats = getStats;
const web3_js_1 = require("@solana/web3.js");
const anchor_service_1 = require("./anchor.service");
const schema_1 = __importDefault(require("../db/schema"));
function startIndexer() {
    try {
        const { provider } = (0, anchor_service_1.getAnchorProgram)();
        const connection = provider.connection;
        const programId = new web3_js_1.PublicKey(process.env.PROGRAM_ID || "9naJhrt9FdAHLwdLnQfgx6citNgEWmW8aLovCS9kYpan");
        connection.onLogs(programId, (logs) => {
            if (logs.err)
                return;
            logs.logs.forEach((log) => {
                if (log.includes("PolicyCreated")) {
                    schema_1.default.prepare("INSERT OR IGNORE INTO events (event_type, tx_signature, data) VALUES (?, ?, ?)").run("PolicyCreated", logs.signature, log);
                }
                if (log.includes("PayoutExecuted")) {
                    schema_1.default.prepare("INSERT OR IGNORE INTO events (event_type, tx_signature, data) VALUES (?, ?, ?)").run("PayoutExecuted", logs.signature, log);
                }
                if (log.includes("PoolFunded")) {
                    schema_1.default.prepare("INSERT OR IGNORE INTO events (event_type, tx_signature, data) VALUES (?, ?, ?)").run("PoolFunded", logs.signature, log);
                }
            });
        });
        console.log("Event indexer started, listening to:", programId.toBase58());
    }
    catch (e) {
        console.error("Indexer failed to start:", e);
    }
}
function getStats() {
    const total = schema_1.default.prepare("SELECT COUNT(*) as n FROM events").get().n;
    const payouts = schema_1.default
        .prepare("SELECT COUNT(*) as n FROM events WHERE event_type = 'PayoutExecuted'")
        .get().n;
    const policies = schema_1.default
        .prepare("SELECT COUNT(*) as n FROM events WHERE event_type = 'PolicyCreated'")
        .get().n;
    return {
        total_events: total,
        payouts_executed: payouts,
        policies_created: policies,
    };
}
