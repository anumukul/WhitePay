import * as postgres from './db/postgres';
import {
  verifyWebhook,
  type WhitePay,
  type VerifyWebhookInput,
} from '@whitepay/node';
import { getDb } from './db/index';
import { client } from './payments/whitepay-adapter';
export const CREDITS_PER_ORDER = 100;
export async function fulfillWebhook(
  input: VerifyWebhookInput,
  wp: { payments: Pick<WhitePay['payments'], 'retrieve'> } = client(),
) {
  const event = verifyWebhook(input);
  if (event.type !== 'payment.succeeded')
    return { ignored: true, granted: false };
  if (process.env.DEMO_DATABASE_URL) return postgres.fulfill(event, wp);
  const d = event.data as any;
  const order = getDb()
    .prepare('SELECT * FROM orders WHERE session_id=?')
    .get(d.sessionId) as any;
  if (
    !order ||
    order.merchant_id !== d.merchantId ||
    d.amountMinor !== '5000000' ||
    d.fee !== '5000'
  )
    throw new Error('payment_order_mismatch');
  const payment = await wp.payments.retrieve(d.paymentId);
  if (
    payment.status !== 'succeeded' ||
    payment.sessionId !== order.session_id ||
    payment.amountMinor !== order.amount_minor ||
    payment.txHash !== d.txHash ||
    payment.blockNumber !== d.blockNumber
  )
    throw new Error('unconfirmed_payment');
  const db = getDb();
  db.exec('BEGIN IMMEDIATE');
  try {
    if (
      db
        .prepare('SELECT event_id FROM webhook_events WHERE event_id=?')
        .get(event.id)
    ) {
      db.exec('COMMIT');
      return { duplicate: true, granted: false };
    }
    db.prepare('INSERT INTO webhook_events VALUES(?,?,?)').run(
      event.id,
      order.id,
      Date.now(),
    );
    if (
      db
        .prepare('SELECT order_id FROM entitlements WHERE order_id=?')
        .get(order.id)
    ) {
      db.exec('COMMIT');
      return { duplicate: true, granted: false };
    }
    db.prepare('INSERT INTO entitlements VALUES(?,?,?,?,?)').run(
      order.id,
      order.customer_id,
      payment.id,
      100,
      Date.now(),
    );
    db.prepare(
      'INSERT INTO credit_ledger(customer_id,delta,order_id,created_at) VALUES(?,100,?,?)',
    ).run(order.customer_id, order.id, Date.now());
    db.prepare("UPDATE orders SET status='paid' WHERE id=?").run(order.id);
    db.exec('COMMIT');
    return { duplicate: false, granted: true };
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
