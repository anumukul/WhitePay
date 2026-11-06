// Worker's read/write bridge to the API's SQLite database.
// Matches on orderId stored inside the submissions.order_payload JSON,
// then writes a payments row and advances the submission to 'settled'.
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomBytes } from "node:crypto";

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

export interface MatchedSubmission {
  submissionId: string;
  merchantId: string;
  sessionId: string;
  payerAddress: string;
}

/**
 * Find the submission that this on-chain orderId corresponds to.
 * Uses JSON_EXTRACT on order_payload. Not case-sensitive on the orderId hex.
 */
export function findSubmissionByOrderId(orderId: string): MatchedSubmission | null {
  const normalized = orderId.toLowerCase();
  const row = getApiDb()
    .prepare(
      `SELECT id as submissionId, merchant_id as merchantId, session_id as sessionId, payer_address as payerAddress
       FROM submissions
       WHERE LOWER(json_extract(order_payload, '$.orderId')) = ?
       LIMIT 1`,
    )
    .get(normalized) as MatchedSubmission | undefined;
  return row ?? null;
}

export interface SettlementRecord {
  merchantId: string;
  sessionId: string;
  submissionId: string;
  amountMinor: bigint;
  txHash: string;
  blockNumber: number;
}

export interface RecordedPayment {
  paymentId: string;
  alreadyExists: boolean;
}

/**
 * Insert (or find) a payments row for this settlement, and mark the submission settled.
 * Idempotent on (session_id, tx_hash): a replay of the same event does not create a second row.
 */
export function recordSettlement(input: SettlementRecord): RecordedPayment {
  const db = getApiDb();
  const existing = db
    .prepare("SELECT id FROM payments WHERE session_id = ? AND tx_hash = ?")
    .get(input.sessionId, input.txHash) as { id: string } | undefined;
  if (existing) return { paymentId: existing.id, alreadyExists: true };

  const paymentId = `pay_${randomBytes(12).toString("hex")}`;
  db.exec("BEGIN");
  try {
    db.prepare(
      `INSERT INTO payments (id, merchant_id, session_id, status, amount_minor, tx_hash, block_number, created_at)
       VALUES (?, ?, ?, 'succeeded', ?, ?, ?, ?)`,
    ).run(
      paymentId,
      input.merchantId,
      input.sessionId,
      Number(input.amountMinor),
      input.txHash,
      input.blockNumber,
      Date.now(),
    );
    db.prepare(
      `UPDATE submissions SET status = 'settled', tx_hash = ?, updated_at = ? WHERE id = ?`,
    ).run(input.txHash, Date.now(), input.submissionId);
    db.prepare(
      `UPDATE checkout_sessions SET status = 'settled' WHERE id = ?`,
    ).run(input.sessionId);
    db.exec("COMMIT");
    return { paymentId, alreadyExists: false };
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

export function countPaymentsForMerchant(merchantId: string): number {
  const row = getApiDb()
    .prepare("SELECT COUNT(*) AS n FROM payments WHERE merchant_id = ?")
    .get(merchantId) as { n: number };
  return row.n;
}

export interface MerchantWebhookInfo {
  webhookUrl: string | null;
  webhookSecret: string;
}

export function getMerchantWebhookInfo(merchantId: string): MerchantWebhookInfo | null {
  const row = getApiDb()
    .prepare("SELECT webhook_url as webhookUrl, webhook_secret as webhookSecret FROM merchants WHERE id = ?")
    .get(merchantId) as MerchantWebhookInfo | undefined;
  return row ?? null;
}
