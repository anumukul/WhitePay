// Reads the API's `submissions` table (same SQLite file, separate read/write connection)
// and advances rows through the status machine: queued → submitted | failed.
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export type APIDB = DatabaseSync;

let apiDb: APIDB | null = null;

export function getApiDb(): APIDB {
  if (apiDb) return apiDb;
  const path = process.env.API_DATABASE_URL?.startsWith("file:")
    ? process.env.API_DATABASE_URL.slice(5)
    : process.env.API_DATABASE_URL || "data/api.db";
  mkdirSync(dirname(path), { recursive: true });
  apiDb = new DatabaseSync(path);
  return apiDb;
}

export function resetApiDbForTests(path: string): APIDB {
  if (apiDb) { try { apiDb.close(); } catch { /* ignore */ } }
  apiDb = null;
  process.env.API_DATABASE_URL = `file:${path}`;
  return getApiDb();
}

export function closeApiDb(): void {
  if (apiDb) { try { apiDb.close(); } catch { /* ignore */ } apiDb = null; }
}

export interface QueuedSubmission {
  id: string;
  merchantId: string;
  sessionId: string;
  payerAddress: string;
  orderDigest: string;
  orderSignature: string;
  tokenSignature: string;
  orderPayload: string;
}

export function pollQueued(limit = 10): QueuedSubmission[] {
  const db = getApiDb();
  return db
    .prepare(
      `SELECT id, merchant_id as merchantId, session_id as sessionId, payer_address as payerAddress,
              order_digest as orderDigest, order_signature as orderSignature,
              token_signature as tokenSignature, order_payload as orderPayload
       FROM submissions
       WHERE status = 'queued'
         AND order_signature IS NOT NULL
         AND token_signature IS NOT NULL
       ORDER BY created_at ASC
       LIMIT ?`,
    )
    .all(limit) as QueuedSubmission[];
}

export function markSubmitted(id: string, txHash: string): void {
  getApiDb()
    .prepare("UPDATE submissions SET status = 'submitted', tx_hash = ?, updated_at = ? WHERE id = ?")
    .run(txHash, Date.now(), id);
}

export function markFailed(id: string, reason: string): void {
  getApiDb()
    .prepare("UPDATE submissions SET status = 'failed', error_reason = ?, updated_at = ? WHERE id = ?")
    .run(reason.slice(0, 200), Date.now(), id);
}

export function getSubmissionStatus(id: string): string | null {
  const row = getApiDb().prepare("SELECT status FROM submissions WHERE id = ?").get(id) as
    | { status: string }
    | undefined;
  return row?.status ?? null;
}
