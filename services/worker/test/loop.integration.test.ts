import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { closeDb } from '@whitepay/api/src/db.js';
import { buildOrderForSession } from '@whitepay/api/src/orders.js';
import { workerFixture, getDb } from './fixtures.js';
import { scanAndPersist } from '../src/loop.js';
after(async () => {
  await closeDb();
});
test('crash before cursor commit rolls back payment and outbox; restart recovers the event', async () => {
  const f = await workerFixture();
  await getDb().query(
    "CREATE FUNCTION crash_cursor() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected cursor crash'; END $$; CREATE TRIGGER crash_cursor BEFORE INSERT OR UPDATE ON chain_cursors FOR EACH ROW EXECUTE FUNCTION crash_cursor()",
  );
  await assert.rejects(
    () => scanAndPersist(f.cfg, f.reader),
    /injected cursor crash/,
  );
  for (const table of [
    'payments',
    'settlement_events',
    'webhook_outbox',
    'chain_cursors',
  ])
    assert.equal(
      (await getDb().query(`SELECT * FROM ${table}`)).rows.length,
      0,
    );
  await getDb().query('DROP TRIGGER crash_cursor ON chain_cursors');
  assert.equal((await scanAndPersist(f.cfg, f.reader)).persisted, 1);
});
test('missing receipt preserves cursor for later retry', async () => {
  const f = await workerFixture();
  f.workerState.receipt = null;
  await assert.rejects(
    () => scanAndPersist(f.cfg, f.reader),
    /receipt_unavailable/,
  );
  assert.equal(
    (await getDb().query('SELECT * FROM chain_cursors')).rows.length,
    0,
  );
  f.workerState.receipt = f.receipt;
  assert.equal((await scanAndPersist(f.cfg, f.reader)).persisted, 1);
});
test('confirmed cursor reorg halts without duplicate fulfillment', async () => {
  const f = await workerFixture();
  await scanAndPersist(f.cfg, f.reader);
  f.workerState.hash = '0x' + 'b'.repeat(64);
  await assert.rejects(() => scanAndPersist(f.cfg, f.reader), /chain_reorg/);
  assert.equal((await getDb().query('SELECT * FROM payments')).rows.length, 1);
});
test('renewed quote preserves historical signed terms for a previously mined payment', async () => {
  const f = await workerFixture();
  await getDb().query(
    "UPDATE submissions SET status='awaiting_signature',order_signature=NULL,token_signature=NULL WHERE id=$1",
    [f.row.id],
  );
  const next = await buildOrderForSession({
    sessionId: f.session.id,
    merchantId: f.merchant.id,
    payerAddress: f.row.payer_address,
    nowMs: (f.row.order_payload.validBefore + 1) * 1000,
    renew: true,
  });
  assert.notEqual(next.orderDigest, f.row.order_digest);
  assert.equal(
    (await getDb().query('SELECT * FROM submission_quotes')).rows.length,
    2,
  );
  assert.equal((await scanAndPersist(f.cfg, f.reader)).persisted, 1);
});
