import { randomBytes } from "node:crypto";
import { getDb } from "./index.js";

export interface GrantInput {
  orderId: string;
  provider: "stripe" | "whitepay";
  providerPaymentId: string;
}

export interface GrantResult {
  granted: boolean;
  downloadToken?: string;
  reason?: "already_granted";
}

export function grantDownloadOnce(input: GrantInput): GrantResult {
  const db = getDb();
  db.exec("BEGIN");
  try {
    const existing = db
      .prepare("SELECT download_token FROM download_entitlements WHERE order_id = ?")
      .get(input.orderId) as { download_token: string } | undefined;
    if (existing) {
      db.exec("ROLLBACK");
      return { granted: false, reason: "already_granted", downloadToken: existing.download_token };
    }
    const token = randomBytes(24).toString("hex");
    db.prepare(
      `INSERT INTO download_entitlements (order_id, provider, provider_payment_id, download_token, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(input.orderId, input.provider, input.providerPaymentId, token, Date.now());
    db.exec("COMMIT");
    return { granted: true, downloadToken: token };
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

export interface DownloadRow {
  orderId: string;
  provider: string;
  providerPaymentId: string;
  downloadToken: string;
  consumedAt: number | null;
  createdAt: number;
}

export function getDownloadByOrder(orderId: string): DownloadRow | undefined {
  const row = getDb()
    .prepare(
      "SELECT order_id as orderId, provider, provider_payment_id as providerPaymentId, download_token as downloadToken, consumed_at as consumedAt, created_at as createdAt FROM download_entitlements WHERE order_id = ?",
    )
    .get(orderId) as DownloadRow | undefined;
  return row;
}

export function consumeDownload(token: string): { ok: boolean; reason?: string; orderId?: string } {
  const db = getDb();
  db.exec("BEGIN");
  try {
    const row = db
      .prepare(
        "SELECT order_id as orderId, consumed_at as consumedAt FROM download_entitlements WHERE download_token = ?",
      )
      .get(token) as { orderId: string; consumedAt: number | null } | undefined;
    if (!row) { db.exec("ROLLBACK"); return { ok: false, reason: "unknown_token" }; }
    if (row.consumedAt) { db.exec("ROLLBACK"); return { ok: false, reason: "already_consumed", orderId: row.orderId }; }
    db.prepare("UPDATE download_entitlements SET consumed_at = ? WHERE download_token = ?").run(Date.now(), token);
    db.exec("COMMIT");
    return { ok: true, orderId: row.orderId };
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

export function countEntitlements(): number {
  const row = getDb().prepare("SELECT COUNT(*) AS n FROM download_entitlements").get() as { n: number };
  return row.n;
}
