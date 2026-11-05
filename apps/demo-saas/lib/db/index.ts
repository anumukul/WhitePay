import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export type DB = DatabaseSync;

let singleton: DB | null = null;

export function getDb(): DB {
  if (singleton) return singleton;
  const path = process.env.DATABASE_URL?.startsWith("file:")
    ? process.env.DATABASE_URL.slice(5)
    : process.env.DATABASE_URL || "data/demo.db";
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec("PRAGMA foreign_keys = ON");
  migrate(db);
  singleton = db;
  return db;
}

export function resetDbForTests(path: string): DB {
  if (singleton) {
    try { singleton.close(); } catch { /* ignore */ }
  }
  singleton = null;
  process.env.DATABASE_URL = `file:${path}`;
  return getDb();
}

export function closeDbForTests(): void {
  if (singleton) {
    try { singleton.close(); } catch { /* ignore */ }
    singleton = null;
  }
}

function migrate(db: DB): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS webhook_events (
      event_id TEXT NOT NULL,
      source TEXT NOT NULL,
      order_id TEXT NOT NULL,
      received_at INTEGER NOT NULL,
      PRIMARY KEY (event_id, source)
    );

    CREATE TABLE IF NOT EXISTS entitlements (
      order_id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      provider_payment_id TEXT NOT NULL,
      credits_granted INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS credit_ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      delta INTEGER NOT NULL,
      reason TEXT NOT NULL,
      order_id TEXT,
      created_at INTEGER NOT NULL
    );
  `);
}
