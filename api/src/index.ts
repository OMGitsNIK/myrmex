import express from "express";
import cors from "cors";
import dotenv from "dotenv";
dotenv.config();

import { policyRouter } from "./routes/policies";
import { policyByPubkeyRouter } from "./routes/policy";
import { poolRouter } from "./routes/pools";
import { simulateRouter } from "./routes/simulate";
import { quoteRouter } from "./routes/quote";
import { statsRouter } from "./routes/stats";
import { oracleRouter } from "./routes/oracle";
import { startIndexer } from "./services/indexer.service";
import { startCron } from "./services/cron.service";

const app = express();
app.use(cors());
app.use(express.json());

app.use("/api/policies", policyRouter);
app.use("/api/policy", policyByPubkeyRouter);
app.use("/api/pools", poolRouter);
app.use("/api/simulate-trigger", simulateRouter);
app.use("/api/quote", quoteRouter);
app.use("/api/stats", statsRouter);
app.use("/api/oracle-report", oracleRouter);

app.get("/health", (_, res) =>
  res.json({ status: "ok", service: "myrmex-api" })
);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`MYRMEX API running on port ${PORT}`);
  startIndexer();
  startCron();
});
