import express, { NextFunction, Request, Response } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";
dotenv.config();

import { policyRouter } from "./routes/policies";
import { policyByPubkeyRouter } from "./routes/policy";
import { poolRouter } from "./routes/pools";
import { simulateRouter } from "./routes/simulate";
import { quoteRouter } from "./routes/quote";
import { statsRouter } from "./routes/stats";
import { oracleRouter } from "./routes/oracle";
import { proposalsRouter } from "./routes/proposals";
import { startIndexer } from "./services/indexer.service";
import { startCron } from "./services/cron.service";
import { startOracleCron } from "./services/oracle.service";

const ALLOWED_ORIGINS = [
  "https://myrmex-iota.vercel.app",
  "http://localhost:3000",
  "http://localhost:3001",
];

const app = express();

// Security headers
app.use(helmet());

// CORS
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
      cb(new Error(`CORS: origin ${origin} not allowed`));
    },
  })
);

// Limit each IP to 120 requests per minute across all routes
const globalLimiter = rateLimit({
  windowMs: 60_000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests — please slow down" },
});
app.use(globalLimiter);

// Tighter limit on simulate endpoint — it triggers on-chain txs
const simulateLimiter = rateLimit({
  windowMs: 60_000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Simulate rate limit exceeded (5 req/min)" },
});
app.use("/api/simulate-trigger", simulateLimiter);

// Quote proxies to Python pricing service — cap to prevent overload
const quoteLimiter = rateLimit({
  windowMs: 60_000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Quote rate limit exceeded (20 req/min)" },
});
app.use("/api/quote", quoteLimiter);

// Cap request body size
app.use(express.json({ limit: "10kb" }));

app.use("/api/policies", policyRouter);
app.use("/api/policy", policyByPubkeyRouter);
app.use("/api/pools", poolRouter);
app.use("/api/simulate-trigger", simulateRouter);
app.use("/api/quote", quoteRouter);
app.use("/api/stats", statsRouter);
app.use("/api/oracle-report", oracleRouter);
app.use("/api/proposals", proposalsRouter);

app.get("/health", (_, res) =>
  res.json({ status: "ok", service: "myrmex-api", version: "2.0-oracle" })
);

// 404 for unmatched routes
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: "Not found" });
});

// Global error handler — catches any unhandled throw from async route handlers.
// Without this, Express 4 returns an empty 500 or leaks a stack trace.
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[api] unhandled error:", err.message, err.stack);
  res.status(500).json({ error: "Internal server error" });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`MYRMEX API running on port ${PORT}`);
  startIndexer();
  startCron();
  if (process.env.ENABLE_ORACLE_CRON === "true") {
    startOracleCron();
  } else {
    console.log("Oracle cron disabled (set ENABLE_ORACLE_CRON=true to enable)");
  }
});
