import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { closeDb } from '@whitepay/api/src/db.js';
import { fixture, getDb } from './fixtures.js';
import { runOnce } from '../src/loop.js';
after(async () => {
  await closeDb();
});
test('preview never signs, broadcasts or reserves budget', async () => {
  const f = await fixture();
  const r = await runOnce(f.cfg, f.chain);
  assert.equal(r.details[0].status, 'preview');
  assert.equal(f.state.signs, 0);
  assert.equal(f.state.broadcasts.length, 0);
  assert.equal(
    (await getDb().query('SELECT * FROM relay_attempts')).rows.length,
    0,
  );
});
test('execute requires exact per-transaction approval', async () => {
  const f = await fixture();
  f.cfg.mode = 'execute';
  const r = await runOnce(f.cfg, f.chain);
  assert.equal(r.details[0].reason, 'specific_approval_required');
  assert.equal(f.state.signs, 0);
});
for (const [name, change, reason] of [
  [
    'wrong chain',
    (f: any) => {
      f.chain.chainId = async () => 1;
    },
    'wrong_chain',
  ],
  [
    'gas limit',
    (f: any) => {
      f.state.gas = 500000n;
    },
    'gas_exceeded',
  ],
  [
    'gas price',
    (f: any) => {
      f.state.gasPrice = 21000000000n;
    },
    'gas_price_exceeded',
  ],
  [
    'L1 fee',
    (f: any) => {
      f.state.l1 = 1001n;
    },
    'l1_fee_exceeded',
  ],
  [
    'daily budget',
    (f: any) => {
      f.cfg.dailyBudgetWei = 1n;
    },
    'budget_exceeded',
  ],
  [
    'native balance',
    (f: any) => {
      f.state.balance = 1n;
    },
    'insufficient_relayer_balance',
  ],
  [
    'unknown pending nonce',
    (f: any) => {
      f.state.pending = 1;
    },
    'unknown_pending_nonce',
  ],
] as const)
  test(`refuses ${name} without signing or broadcast`, async () => {
    const f = await fixture();
    change(f);
    const r = await runOnce(f.cfg, f.chain);
    assert.equal(r.details[0].reason, reason);
    assert.equal(f.state.signs, 0);
    assert.equal(f.state.broadcasts.length, 0);
  });
test('concurrent workers submit once using a PostgreSQL account lock', async () => {
  const f = await fixture();
  const approval = await f.approve();
  f.cfg.mode = 'execute';
  await Promise.all([
    runOnce(f.cfg, f.chain, 10, approval),
    runOnce(f.cfg, f.chain, 10, approval),
  ]);
  assert.equal(f.state.signs, 1);
  assert.equal(f.state.broadcasts.length, 1);
  assert.equal(
    (await getDb().query('SELECT * FROM relay_attempts')).rows.length,
    1,
  );
});
test('approval hash cannot be reused for changed nonce or fee limits', async () => {
  const f = await fixture();
  const approval = await f.approve();
  f.cfg.mode = 'execute';
  f.cfg.maxGasPriceWei += 1n;
  const r = await runOnce(f.cfg, f.chain, 10, approval);
  assert.equal(r.details[0].reason, 'specific_approval_required');
  assert.equal(f.state.signs, 0);
});
