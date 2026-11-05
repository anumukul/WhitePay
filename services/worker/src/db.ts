import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export type DB = DatabaseSync;
let singleton: DB | null = null;

export function getDb(): DB {
  if (singleton) return singleton;
  const path = process.env.WORKER_DATABASE_URL?.startsWith("file:")
    ? process.env.WORKER_DATABASE_URL.slice(5)
    : process.env.WORKER_DATABASE_URL || "data/worker.db";
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
  process.env.WORKER_DATABASE_URL = `file:${path}`;
  return getDb();
}
export function closeDb(): void {
  if (singleton) { try { singleton.close(); } catch { /* ignore */ } singleton = null; }
}

function migrate(db: DB): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS scan_cursor (
      scope TEXT PRIMARY KEY,
      last_block INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS settlements (
      event_id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      tx_hash TEXT NOT NULL,
      block_number INTEGER NOT NULL,
      amount_minor TEXT NOT NULL,
      merchant_payout TEXT NOT NULL,
      token_address TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_settlements_order ON settlements(order_id);

    CREATE TABLE IF NOT EXISTS webhook_deliveries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id TEXT NOT NULL,
      url TEXT NOT NULL,
      status TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      last_response_code INTEGER,
      last_attempt_at INTEGER,
      UNIQUE(event_id, url)
    );
  `);
}

export function getCursor(scope: string): number {
  const row = getDb().prepare("SELECT last_block FROM scan_cursor WHERE scope = ?").get(scope) as
    | { last_block: number }
    | undefined;
  return row?.last_block ?? 0;
}

export function setCursor(scope: string, block: number): void {
  getDb().prepare("INSERT OR REPLACE INTO scan_cursor (scope, last_block) VALUES (?, ?)").run(scope, block);
}

export function recordSettlement(input: {
  eventId: string;
  orderId: string;
  txHash: string;
  blockNumber: number;
  amountMinor: bigint;
  merchantPayout: string;
  tokenAddress: string;
}): { inserted: boolean } {
  try {
    getDb()
      .prepare(
        `INSERT INTO settlements (event_id, order_id, tx_hash, block_number, amount_minor, merchant_payout, token_address, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.eventId,
        input.orderId,
        input.txHash,
        input.blockNumber,
        input.amountMinor.toString(),
        input.merchantPayout,
        input.tokenAddress,
        Date.now(),
      );
    return { inserted: true };
  } catch (e) {
    if (e instanceof Error && /UNIQUE/i.test(e.message)) return { inserted: false };
    throw e;
  }
}
