import * as postgres from './postgres';
import { getDb } from './index';
function sqliteCreditBalance(customerId: string) {
  return Number(
    (
      getDb()
        .prepare(
          'SELECT COALESCE(SUM(delta),0) AS balance FROM credit_ledger WHERE customer_id=?',
        )
        .get(customerId) as any
    ).balance,
  );
}
function sqliteSpendOneCredit(customerId: string) {
  const db = getDb();
  db.exec('BEGIN IMMEDIATE');
  try {
    const balance = sqliteCreditBalance(customerId);
    if (balance <= 0) {
      db.exec('ROLLBACK');
      return { ok: false, balance };
    }
    db.prepare(
      'INSERT INTO credit_ledger(customer_id,delta,order_id,created_at) VALUES(?,-1,NULL,?)',
    ).run(customerId, Date.now());
    db.exec('COMMIT');
    return { ok: true, balance: balance - 1 };
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
function sqliteGetEntitlement(orderId: string, customerId: string) {
  return getDb()
    .prepare(
      'SELECT order_id AS orderId,payment_id AS paymentId,credits_granted AS creditsGranted FROM entitlements WHERE order_id=? AND customer_id=?',
    )
    .get(orderId, customerId);
}

export async function creditBalance(customerId: string) {
  return process.env.DEMO_DATABASE_URL
    ? postgres.creditBalance(customerId)
    : sqliteCreditBalance(customerId);
}

export async function spendOneCredit(customerId: string) {
  return process.env.DEMO_DATABASE_URL
    ? postgres.spendOneCredit(customerId)
    : sqliteSpendOneCredit(customerId);
}

export async function getEntitlement(orderId: string, customerId: string) {
  return process.env.DEMO_DATABASE_URL
    ? postgres.getEntitlement(orderId, customerId)
    : sqliteGetEntitlement(orderId, customerId);
}
