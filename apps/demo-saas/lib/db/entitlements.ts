import { getDb } from "./index.js";

export interface GrantInput {
  orderId: string;
  provider: "stripe" | "whitepay";
  providerPaymentId: string;
  credits: number;
}

export interface GrantResult {
  granted: boolean;
  reason?: "already_granted";
}

export function grantEntitlementOnce(input: GrantInput): GrantResult {
  const db = getDb();
  db.exec("BEGIN");
  try {
    const existing = db
      .prepare("SELECT order_id FROM entitlements WHERE order_id = ?")
      .get(input.orderId);
    if (existing) {
      db.exec("ROLLBACK");
      return { granted: false, reason: "already_granted" };
    }
    db.prepare(
      `INSERT INTO entitlements (order_id, provider, provider_payment_id, credits_granted, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(input.orderId, input.provider, input.providerPaymentId, input.credits, Date.now());
    db.prepare(
      `INSERT INTO credit_ledger (delta, reason, order_id, created_at) VALUES (?, ?, ?, ?)`,
    ).run(input.credits, `grant:${input.provider}`, input.orderId, Date.now());
    db.exec("COMMIT");
    return { granted: true };
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

export function creditBalance(): number {
  const db = getDb();
  const row = db
    .prepare("SELECT COALESCE(SUM(delta), 0) AS balance FROM credit_ledger")
    .get() as { balance: number };
  return row.balance;
}

export function spendOneCredit(): { ok: boolean; balance: number } {
  const db = getDb();
  db.exec("BEGIN");
  try {
    const balance = creditBalance();
    if (balance <= 0) {
      db.exec("ROLLBACK");
      return { ok: false, balance };
    }
    db.prepare(
      `INSERT INTO credit_ledger (delta, reason, order_id, created_at) VALUES (?, ?, NULL, ?)`,
    ).run(-1, "spend", Date.now());
    db.exec("COMMIT");
    return { ok: true, balance: balance - 1 };
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

export function getEntitlement(orderId: string) {
  return getDb()
    .prepare(
      "SELECT order_id as orderId, provider, provider_payment_id as providerPaymentId, credits_granted as creditsGranted, created_at as createdAt FROM entitlements WHERE order_id = ?",
    )
    .get(orderId) as
    | {
        orderId: string;
        provider: string;
        providerPaymentId: string;
        creditsGranted: number;
        createdAt: number;
      }
    | undefined;
}
