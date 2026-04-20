"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const path_1 = __importDefault(require("path"));
const DB_PATH = process.env.DB_PATH || path_1.default.join(__dirname, "../../myrmex.db");
const db = new better_sqlite3_1.default(DB_PATH);
db.exec(`
  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type TEXT NOT NULL,
    tx_signature TEXT UNIQUE NOT NULL,
    data TEXT,
    created_at INTEGER DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS policies (
    pubkey TEXT PRIMARY KEY,
    policyholder TEXT,
    pool TEXT,
    coverage_type INTEGER,
    payout_amount INTEGER,
    premium_amount INTEGER,
    expires_at INTEGER,
    is_active INTEGER DEFAULT 1,
    is_claimed INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS pools (
    pubkey TEXT PRIMARY KEY,
    pool_type INTEGER,
    total_liquidity INTEGER DEFAULT 0,
    total_locked INTEGER DEFAULT 0,
    active_policy_count INTEGER DEFAULT 0,
    updated_at INTEGER DEFAULT (unixepoch())
  );
`);
exports.default = db;
