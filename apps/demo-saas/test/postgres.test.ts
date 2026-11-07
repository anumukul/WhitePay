import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import * as pg from '../lib/db/postgres.js';
import { Pool } from 'pg';
if (!process.env.TEST_DATABASE_URL)
  throw Error('Dedicated TEST_DATABASE_URL required');
process.env.DEMO_DATABASE_URL = process.env.TEST_DATABASE_URL;
after(() => pg.close());
async function fixture() {
  const a = await pg.createCustomer(),
    b = await pg.createCustomer(),
    order = await pg.createOrder(a.id, 'merchant_test'),
    session = 'cs_' + randomUUID();
  await pg.bindSession(order.id, a.id, session);
  const event = {
    id: 'evt_' + randomUUID(),
    data: {
      sessionId: session,
      merchantId: 'merchant_test',
      amountMinor: '5000000',
      fee: '5000',
      paymentId: 'pay_' + randomUUID(),
      txHash: '0x' + '3'.repeat(64),
      blockNumber: 1000,
    },
  };
  const wp = {
    payments: {
      retrieve: async () => ({
        id: event.data.paymentId,
        status: 'succeeded',
        sessionId: session,
        amountMinor: 5000000,
        txHash: event.data.txHash,
        blockNumber: 1000,
      }),
    },
  };
  return { a, b, order, event, wp };
}
test('Postgres preserves ownership and customer token expiry', async () => {
  const f = await fixture();
  assert.equal(await pg.ownsSession(f.b.id, f.event.data.sessionId), false);
  assert.equal(await pg.orderForCustomer(f.order.id, f.b.id), undefined);
  assert.equal((await pg.customerFromToken(f.a.token))?.id, f.a.id);
  assert.equal(
    await pg.customerFromToken(f.a.token, Date.now() + 90000000),
    null,
  );
});
test('concurrent webhook retries and distinct event IDs grant once', async () => {
  const f = await fixture();
  const results = await Promise.all(
    Array.from({ length: 8 }, (_, i) =>
      pg.fulfill(
        { ...f.event, id: i % 2 ? f.event.id : 'evt_' + randomUUID() },
        f.wp,
      ),
    ),
  );
  assert.equal(results.filter((r) => r.granted).length, 1);
  assert.equal(await pg.creditBalance(f.a.id), 100);
  assert.equal(await pg.creditBalance(f.b.id), 0);
});
test('concurrent spending cannot overdraw and state survives a new pool', async () => {
  const f = await fixture();
  await pg.fulfill(f.event, f.wp);
  const results = await Promise.all(
    Array.from({ length: 105 }, () => pg.spendOneCredit(f.a.id)),
  );
  assert.equal(results.filter((r) => r.ok).length, 100);
  assert.equal(await pg.creditBalance(f.a.id), 0);
  await pg.close();
  assert.equal(await pg.creditBalance(f.a.id), 0);
  assert.ok(await pg.getEntitlement(f.order.id, f.a.id));
});
test('unconfirmed payment and changed merchant or amount grant nothing', async () => {
  const f = await fixture();
  for (const data of [
    { ...f.event.data, merchantId: 'other' },
    { ...f.event.data, amountMinor: '1' },
  ])
    await assert.rejects(() => pg.fulfill({ ...f.event, data }, f.wp));
  await assert.rejects(() =>
    pg.fulfill(f.event, {
      payments: {
        retrieve: async () => ({
          ...(await f.wp.payments.retrieve()),
          status: 'pending',
        }),
      },
    }),
  );
  assert.equal(await pg.creditBalance(f.a.id), 0);
});
test('failed Postgres credit insertion rolls back entitlement and event, then retries safely', async () => {
  const f = await fixture(),
    db = new Pool({
      connectionString: process.env.TEST_DATABASE_URL,
      options: '-c search_path=whitepay_saas',
    }),
    constraint = 'test_' + randomUUID().replaceAll('-', '');
  try {
    await db.query(
      `ALTER TABLE credit_ledger ADD CONSTRAINT ${constraint} CHECK(customer_id <> '${f.a.id}') NOT VALID`,
    );
    await assert.rejects(() => pg.fulfill(f.event, f.wp));
    assert.equal(
      Number(
        (
          await db.query(
            'SELECT count(*) AS n FROM webhook_events WHERE event_id=$1',
            [f.event.id],
          )
        ).rows[0].n,
      ),
      0,
    );
    assert.equal(await pg.getEntitlement(f.order.id, f.a.id), undefined);
    await db.query(`ALTER TABLE credit_ledger DROP CONSTRAINT ${constraint}`);
    assert.equal((await pg.fulfill(f.event, f.wp)).granted, true);
    assert.equal(await pg.creditBalance(f.a.id), 100);
  } finally {
    await db.query(
      `ALTER TABLE credit_ledger DROP CONSTRAINT IF EXISTS ${constraint}`,
    );
    await db.end();
  }
});
