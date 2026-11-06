import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { resetDbForTests, closeDb } from '@whitepay/api/src/db.js';
import { runOnce } from '../src/loop.js';
before(async () => {
  await resetDbForTests(randomUUID());
});
after(async () => {
  await closeDb();
});
test('relayer reads the authoritative PostgreSQL queue without separate SQLite storage', async () => {
  const result = await runOnce(
    {
      expectedChainId: 1874,
      checkoutAddress: '0x' + 'c'.repeat(40),
      maxGasPerSettle: 500000n,
      maxGasPriceWei: 20000000000n,
      dailyBudgetWei: 10n ** 17n,
      maxFeeBasisPointsDrift: 0,
    } as any,
    { relayerAddress: '0x' + 'a'.repeat(40) } as any,
  );
  assert.equal(result.processed, 0);
});
