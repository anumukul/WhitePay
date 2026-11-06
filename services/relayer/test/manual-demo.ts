// Interactive synthetic demo: only local PostgreSQL and in-memory fake-chain calls.
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import assert from 'node:assert/strict';
import { fixture, getDb } from './fixtures.js';
import { closeDb } from '@whitepay/api/src/db.js';
import { runOnce } from '../src/loop.js';
import { validate } from '../src/validate.js';
const automatic = process.argv.includes('--auto');
const rl = automatic ? null : createInterface({ input: stdin, output: stdout });
const step = async (message: string) => {
  console.log(message);
  if (rl) await rl.question('Press Enter to continue this local simulation: ');
};
try {
  const f = await fixture();
  console.log(
    'SYNTHETIC LOCAL DEMO: no RPC, no real wallet, no live transaction. Test schema will be removed on exit.',
  );
  const preview = await runOnce(f.cfg, f.chain);
  console.log(JSON.stringify(preview, null, 2));
  assert.equal(f.state.signs, 0);
  assert.equal(f.state.broadcasts.length, 0);
  await step(
    '1. Preview only: verify unsigned hash, gas and budget reservation amount above. No signing/broadcast occurred.',
  );
  const altered = structuredClone(f.row);
  altered.order_payload.amount = '1';
  await assert.rejects(
    () => validate(altered, f.cfg, f.state.now),
    /amount_mismatch/,
  );
  console.log(
    '2. Frontend amount tampering rejected; simulated broadcast count = 0.',
  );
  const approval = await f.approve();
  f.cfg.mode = 'execute';
  f.state.failBroadcast = true;
  await runOnce(f.cfg, f.chain, 10, approval);
  const before = (
    await getDb().query('SELECT nonce,state,reserved_wei FROM relay_attempts')
  ).rows[0];
  console.log(JSON.stringify({ stage: 'ambiguous_fake_broadcast', ...before }));
  await step(
    '3. Exact signed bytes/hash persisted before simulated timeout. Budget remains reserved; nonce stays fixed.',
  );
  f.state.failBroadcast = false;
  await runOnce(f.cfg, f.chain);
  assert.equal(f.state.signs, 1);
  assert.equal(f.state.broadcasts[0], f.state.broadcasts[1]);
  console.log(
    '4. Recovery resent the same bytes: sign count 1, fake broadcast attempts 2, unique transaction 1.',
  );
  await step('Inspect recovery result, then continue to simulate mining.');
  f.mine();
  const confirmed = await runOnce(f.cfg, f.chain);
  const ledger = (
    await getDb().query(
      'SELECT nonce,state,reserved_wei,charged_wei FROM relay_attempts',
    )
  ).rows[0];
  console.log(
    JSON.stringify(
      { stage: 'reconciled_fake_receipt', result: confirmed, ledger },
      null,
      2,
    ),
  );
  assert.equal(ledger.state, 'mined');
  assert.equal(ledger.reserved_wei, '0');
  console.log(
    'PASS: actual synthetic L2+L1 debit reconciled; API remains submitted for Step 07 indexer validation. No fulfillment was fabricated.',
  );
} finally {
  rl?.close();
  await closeDb();
}
