import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export type DB = DatabaseSync;

let singleton: DB | null = null;

export function getDb(): DB {
  if (singleton) return singleton;
  const path = process.env.DATABASE_URL?.startsWith("file:")
    ? process.env.DATABASE_URL.slice(5)
    : process.env.DATABASE_URL || "data/api.db";
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec("PRAGMA foreign_keys = ON");
  migrate(db);
  singleton = db;
  return db;
}

export function resetDbForTests(path: string): DB {
  if (singleton) { try { singleton.close(); } catch { /* ignore */ } }
  singleton = null;
  process.env.DATABASE_URL = `file:${path}`;
  return getDb();
}

export function closeDb(): void {
  if (singleton) { try { singleton.close(); } catch { /* ignore */ } singleton = null; }
}

function migrate(db: DB): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS merchants (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      payout_address TEXT NOT NULL,
      webhook_url TEXT,
      webhook_secret TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS api_keys (
      id TEXT PRIMARY KEY,
      merchant_id TEXT NOT NULL REFERENCES merchants(id),
      key_hash TEXT NOT NULL UNIQUE,
      prefix TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      revoked_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);

    CREATE TABLE IF NOT EXISTS prices (
      id TEXT PRIMARY KEY,
      merchant_id TEXT NOT NULL REFERENCES merchants(id),
      amount_minor INTEGER NOT NULL,
      currency TEXT NOT NULL,
      token_address TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_prices_merchant ON prices(merchant_id);

    CREATE TABLE IF NOT EXISTS checkout_sessions (
      id TEXT PRIMARY KEY,
      merchant_id TEXT NOT NULL REFERENCES merchants(id),
      price_id TEXT NOT NULL REFERENCES prices(id),
      external_order_id TEXT NOT NULL,
      status TEXT NOT NULL,
      redirect_url TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      UNIQUE(merchant_id, external_order_id)
    );

    CREATE TABLE IF NOT EXISTS idempotency_keys (
      key TEXT NOT NULL,
      merchant_id TEXT NOT NULL REFERENCES merchants(id),
      response_body TEXT NOT NULL,
      response_status INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (merchant_id, key)
    );

    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      merchant_id TEXT NOT NULL REFERENCES merchants(id),
      session_id TEXT NOT NULL REFERENCES checkout_sessions(id),
      status TEXT NOT NULL,
      amount_minor INTEGER NOT NULL,
      tx_hash TEXT,
      block_number INTEGER,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_payments_merchant ON payments(merchant_id);

    CREATE TABLE IF NOT EXISTS submissions (
      id TEXT PRIMARY KEY,
      merchant_id TEXT NOT NULL REFERENCES merchants(id),
      session_id TEXT NOT NULL REFERENCES checkout_sessions(id),
      payer_address TEXT NOT NULL,
      order_payload TEXT NOT NULL,
      order_digest TEXT NOT NULL UNIQUE,
      order_signature TEXT,
      token_signature TEXT,
      status TEXT NOT NULL,
      tx_hash TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE (session_id, payer_address)
    );
    CREATE INDEX IF NOT EXISTS idx_submissions_status ON submissions(status);
    CREATE INDEX IF NOT EXISTS idx_submissions_merchant ON submissions(merchant_id);
  `);
}
