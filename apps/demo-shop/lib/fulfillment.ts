import {
  verifyWebhook,
  type WhitePay,
  type VerifyWebhookInput,
} from '@whitepay/node';
import { randomBytes } from 'node:crypto';
import { getDb } from './db/index';
import { client } from './payments/whitepay-adapter';
import { PRODUCT_FEE_MINOR, PRODUCT_PRICE_MINOR } from './product';
export async function fulfillWebhook(
  input: VerifyWebhookInput,
  wp: { payments: Pick<WhitePay['payments'], 'retrieve'> } = client(),
) {
  const event = verifyWebhook(input);
  if (event.type !== 'payment.succeeded')
    return { ignored: true, granted: false };
  const d = event.data as any;
  const order = getDb()
    .prepare('SELECT * FROM orders WHERE session_id=?')
    .get(d.sessionId) as any;
  if (
    !order ||
    order.merchant_id !== d.merchantId ||
    d.amountMinor !== String(PRODUCT_PRICE_MINOR) ||
    d.fee !== String(PRODUCT_FEE_MINOR)
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
    db.prepare(
      'INSERT INTO entitlements(order_id,customer_id,payment_id,download_token,downloads,created_at) VALUES(?,?,?,?,0,?)',
    ).run(
      order.id,
      order.customer_id,
      payment.id,
      randomBytes(32).toString('hex'),
      Date.now(),
    );
    db.prepare("UPDATE orders SET status='paid' WHERE id=?").run(order.id);
    db.exec('COMMIT');
    return { duplicate: false, granted: true };
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
