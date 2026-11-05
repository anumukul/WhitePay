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
  const tx = db.transaction(() => {
    const existing = db
      .prepare("SELECT order_id FROM entitlements WHERE order_id = ?")
      .get(input.orderId);
    if (existing) return { granted: false, reason: "already_granted" as const };

    db.prepare(
      `INSERT INTO entitlements (order_id, provider, provider_payment_id, credits_granted, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(input.orderId, input.provider, input.providerPaymentId, input.credits, Date.now());

    db.prepare(
      `INSERT INTO credit_ledger (delta, reason, order_id, created_at) VALUES (?, ?, ?, ?)`,
    ).run(input.credits, `grant:${input.provider}`, input.orderId, Date.now());

    return { granted: true };
  });
  return tx();
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
  const tx = db.transaction(() => {
    const balance = creditBalance();
    if (balance <= 0) return { ok: false, balance };
    db.prepare(
      `INSERT INTO credit_ledger (delta, reason, order_id, created_at) VALUES (?, ?, NULL, ?)`,
    ).run(-1, "spend", Date.now());
    return { ok: true, balance: balance - 1 };
  });
  return tx();
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
