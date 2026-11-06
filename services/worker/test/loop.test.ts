import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { closeDb } from '@whitepay/api/src/db.js';
import { workerFixture, getDb } from './fixtures.js';
import { scanAndPersist } from '../src/loop.js';
after(async () => {
  await closeDb();
});
test('full receipt creates one payment, session settlement and transactional outbox', async () => {
  const f = await workerFixture();
  const result = await scanAndPersist(f.cfg, f.reader);
  assert.equal(result.persisted, 1);
  for (const table of ['payments', 'settlement_events', 'webhook_outbox'])
    assert.equal(
      (await getDb().query(`SELECT * FROM ${table}`)).rows.length,
      1,
    );
  assert.equal(
    (
      await getDb().query('SELECT status FROM checkout_sessions WHERE id=$1', [
        f.session.id,
      ])
    ).rows[0].status,
    'settled',
  );
});
test('same event scanned by a new scope does not duplicate payment or webhook', async () => {
  const f = await workerFixture();
  await scanAndPersist(f.cfg, f.reader);
  const result = await scanAndPersist({ ...f.cfg, scope: 'rescan' }, f.reader);
  assert.equal(result.duplicates, 1);
  assert.equal((await getDb().query('SELECT * FROM payments')).rows.length, 1);
  assert.equal(
    (await getDb().query('SELECT * FROM webhook_outbox')).rows.length,
    1,
  );
});
for (const [name, mutate] of [
  [
    'wrong payer',
    (f: any) => {
      f.log.payer = '0x' + 'd'.repeat(40);
    },
  ],
  [
    'wrong amount',
    (f: any) => {
      f.log.amount = 1n;
    },
  ],
  [
    'wrong merchant',
    (f: any) => {
      f.log.merchant = '0x' + 'd'.repeat(40);
    },
  ],
  [
    'wrong fee',
    (f: any) => {
      f.log.fee = 2n;
    },
  ],
  [
    'wrong fee recipient',
    (f: any) => {
      f.log.feeRecipient = '0x' + 'd'.repeat(40);
    },
  ],
  [
    'wrong token',
    (f: any) => {
      f.log.token = '0x' + 'd'.repeat(40);
    },
  ],
  [
    'wrong quote',
    (f: any) => {
      f.log.quoteId = '0x' + 'd'.repeat(64);
    },
  ],
  [
    'wrong log index',
    (f: any) => {
      f.log.logIndex = 100;
    },
  ],
  [
    'reverted receipt',
    (f: any) => {
      f.receipt.status = 'reverted';
    },
  ],
  [
    'success without event',
    (f: any) => {
      f.receipt.logs = f.receipt.logs.filter((l: any) => l.logIndex !== 1);
    },
  ],
  [
    'wrong authorization nonce',
    (f: any) => {
      f.receipt.logs = [
        {
          ...f.receipt.logs[0],
          topics: [
            ...f.receipt.logs[0].topics.slice(0, 2),
            '0x' + 'd'.repeat(64),
          ],
        },
        ...f.receipt.logs.slice(1),
      ];
    },
  ],
] as const)
  test(`${name} cannot settle or enqueue fulfillment`, async () => {
    const f = await workerFixture();
    mutate(f);
    const r = await scanAndPersist(f.cfg, f.reader);
    assert.equal(r.persisted, 0);
    assert.equal(
      (await getDb().query('SELECT * FROM payments')).rows.length,
      0,
    );
    assert.equal(
      (await getDb().query('SELECT * FROM webhook_outbox')).rows.length,
      0,
    );
  });
