import Database from "better-sqlite3";
import path from "path";

const DB_PATH = process.env.DB_PATH || path.join(__dirname, "../../myrmex.db");
const db = new Database(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type TEXT NOT NULL,
    tx_signature TEXT UNIQUE NOT NULL,
    data TEXT,
    created_at INTEGER DEFAULT (unixepoch())
  );

  CREATE INDEX IF NOT EXISTS idx_events_event_type ON events (event_type);
  CREATE INDEX IF NOT EXISTS idx_events_created_at ON events (created_at);

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

export default db;
