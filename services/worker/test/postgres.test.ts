import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { closeDb, getDb } from '@whitepay/api/src/db.js';
import { fixture } from '../../relayer/test/fixtures.js';
import { scanAndPersist } from '../src/loop.js';
after(async () => {
  await closeDb();
});
test('worker consumes authoritative PostgreSQL queue without a separate SQLite database', async () => {
  const f = await fixture();
  const result = await scanAndPersist(
    {
      scope: 'pg-regression',
      chainId: 1874,
      checkoutAddress: f.cfg.checkoutAddress,
      fromBlock: 10,
      confirmations: 2,
    } as any,
    {
      getHead: async () => 12,
      getLogs: async () => [],
      getBlockHash: async () => '0x' + 'a'.repeat(64),
      chainId: async () => 1874,
    } as any,
  );
  assert.equal(result.persisted, 0);
  assert.equal(
    Number(
      (
        await getDb().query(
          'SELECT last_block FROM chain_cursors WHERE scope=$1',
          ['pg-regression'],
        )
      ).rows[0].last_block,
    ),
    11,
  );
});
