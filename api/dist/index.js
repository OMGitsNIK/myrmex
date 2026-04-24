"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const policies_1 = require("./routes/policies");
const policy_1 = require("./routes/policy");
const pools_1 = require("./routes/pools");
const simulate_1 = require("./routes/simulate");
const quote_1 = require("./routes/quote");
const stats_1 = require("./routes/stats");
const oracle_1 = require("./routes/oracle");
const proposals_1 = require("./routes/proposals");
const indexer_service_1 = require("./services/indexer.service");
const cron_service_1 = require("./services/cron.service");
const oracle_service_1 = require("./services/oracle.service");
const ALLOWED_ORIGINS = [
    "https://myrmex-iota.vercel.app",
    "http://localhost:3000",
    "http://localhost:3001",
];
const app = (0, express_1.default)();
// Security headers
app.use((0, helmet_1.default)());
// CORS
app.use((0, cors_1.default)({
    origin: (origin, cb) => {
        if (!origin || ALLOWED_ORIGINS.includes(origin))
            return cb(null, true);
        cb(new Error(`CORS: origin ${origin} not allowed`));
    },
}));
// Limit each IP to 120 requests per minute across all routes
const globalLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests — please slow down" },
});
app.use(globalLimiter);
// Tighter limit on simulate endpoint — it triggers on-chain txs
const simulateLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Simulate rate limit exceeded (5 req/min)" },
});
app.use("/api/simulate-trigger", simulateLimiter);
// Cap request body size
app.use(express_1.default.json({ limit: "10kb" }));
app.use("/api/policies", policies_1.policyRouter);
app.use("/api/policy", policy_1.policyByPubkeyRouter);
app.use("/api/pools", pools_1.poolRouter);
app.use("/api/simulate-trigger", simulate_1.simulateRouter);
app.use("/api/quote", quote_1.quoteRouter);
app.use("/api/stats", stats_1.statsRouter);
app.use("/api/oracle-report", oracle_1.oracleRouter);
app.use("/api/proposals", proposals_1.proposalsRouter);
app.get("/health", (_, res) => res.json({ status: "ok", service: "myrmex-api", version: "2.0-oracle" }));
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`MYRMEX API running on port ${PORT}`);
    (0, indexer_service_1.startIndexer)();
    (0, cron_service_1.startCron)();
    if (process.env.ENABLE_ORACLE_CRON === "true") {
        (0, oracle_service_1.startOracleCron)();
    }
    else {
        console.log("Oracle cron disabled (set ENABLE_ORACLE_CRON=true to enable)");
    }
});
