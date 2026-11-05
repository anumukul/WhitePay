import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export type DB = DatabaseSync;

let singleton: DB | null = null;

export function getDb(): DB {
  if (singleton) return singleton;
  const path = process.env.RELAYER_DATABASE_URL?.startsWith("file:")
    ? process.env.RELAYER_DATABASE_URL.slice(5)
    : process.env.RELAYER_DATABASE_URL || "data/relayer.db";
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
  process.env.RELAYER_DATABASE_URL = `file:${path}`;
  return getDb();
}

export function closeDb(): void {
  if (singleton) { try { singleton.close(); } catch { /* ignore */ } singleton = null; }
}

function migrate(db: DB): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS submissions (
      order_id TEXT PRIMARY KEY,
      tx_hash TEXT,
      status TEXT NOT NULL,
      gas_wei_spent TEXT,
      submitted_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS budget_spend (
      day TEXT PRIMARY KEY,
      spent_wei TEXT NOT NULL
    );
  `);
}

export function dayKey(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

export function readDailySpend(day: string): bigint {
  const row = getDb().prepare("SELECT spent_wei as spent FROM budget_spend WHERE day = ?").get(day) as
    | { spent: string }
    | undefined;
  return row ? BigInt(row.spent) : 0n;
}

export function addDailySpend(day: string, delta: bigint): void {
  const current = readDailySpend(day);
  getDb().prepare("INSERT OR REPLACE INTO budget_spend (day, spent_wei) VALUES (?, ?)").run(day, (current + delta).toString());
}

export function getSubmission(orderId: string): { txHash: string | null; status: string } | null {
  const row = getDb()
    .prepare("SELECT tx_hash as txHash, status FROM submissions WHERE order_id = ?")
    .get(orderId) as { txHash: string | null; status: string } | undefined;
  return row ?? null;
}

export function recordSubmission(orderId: string, status: string, txHash: string | null, gasWeiSpent: bigint): void {
  getDb()
    .prepare(
      "INSERT OR REPLACE INTO submissions (order_id, status, tx_hash, gas_wei_spent, submitted_at) VALUES (?, ?, ?, ?, ?)",
    )
    .run(orderId, status, txHash, gasWeiSpent.toString(), Date.now());
}
