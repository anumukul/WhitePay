import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { WhitePayChainClient } from '@whitepay/chain';
import { migrate, getDb, closeDb } from '../src/db.js';
import { createWorkerReader } from '../src/chain.js';
import { scanAndPersist } from '../src/loop.js';
process.chdir(fileURLToPath(new URL('../../../', import.meta.url)));
const originalProof =
  '0x579f92812ea2f5d8bbe67b49c33fb0a7a75fbe61ab98edc129e832b2ebca034e';
const [mode = 'inspect', txHash = originalProof] = process.argv.slice(2);
const checkout = '0x4d1761ABB4eD290F23fcDA00890039800E2e53f0';
try {
  assert.ok(mode === 'index' || mode === 'inspect');
  assert.match(txHash, /^0x[0-9a-fA-F]{64}$/);
  await migrate();
  const client = new WhitePayChainClient({
    rpcUrl: 'https://rpc.testnet.whitechain.io',
    expectedChainId: 1874,
    checkoutAddress: checkout,
  });
  const reader = createWorkerReader(
    client,
    '0x3a9aa44166dd8ec13f12718f9b5c4515ea494622654761b1cb26f23c6c456efd',
  );
  assert.equal(await reader.chainId(), 1874);
  const receipt = await reader.getReceipt(txHash);
  assert.ok(receipt && receipt.status === 'success');
  assert.ok((await reader.getHead()) >= receipt.blockNumber + 1);
  const db = getDb();
  const submission = (
    await db.query('SELECT id,session_id FROM submissions WHERE tx_hash=$1', [
      txHash,
    ])
  ).rows;
  assert.equal(submission.length, 1);
  const cfg = {
    scope: 'step07-proof:' + txHash,
    chainId: 1874 as const,
    checkoutAddress: checkout,
    fromBlock: receipt.blockNumber,
    confirmations: 2,
    batchSize: 1,
  };
  let indexed, duplicate;
  if (mode === 'index') {
    indexed = await scanAndPersist(cfg, reader);
    duplicate = await scanAndPersist(
      { ...cfg, scope: cfg.scope + ':duplicate' },
      reader,
    );
  }
  const payments = (
    await db.query(
      'SELECT id,status,amount_minor,tx_hash,block_number FROM payments WHERE session_id=$1',
      [submission[0].session_id],
    )
  ).rows;
  const events = (
    await db.query(
      'SELECT event_id,state,payment_id FROM settlement_events WHERE tx_hash=$1',
      [txHash],
    )
  ).rows;
  const outbox = (
    await db.query(
      'SELECT state,attempts FROM webhook_outbox WHERE payment_id IN (SELECT id FROM payments WHERE session_id=$1)',
      [submission[0].session_id],
    )
  ).rows;
  const session = (
    await db.query('SELECT status FROM checkout_sessions WHERE id=$1', [
      submission[0].session_id,
    ])
  ).rows[0];
  const cursors = (
    await db.query(
      'SELECT scope,last_block,last_block_hash FROM chain_cursors WHERE scope=$1 OR scope=$2',
      [cfg.scope, cfg.scope + ':duplicate'],
    )
  ).rows;
  assert.equal(payments.length, 1);
  assert.equal(payments[0].status, 'succeeded');
  assert.equal(payments[0].amount_minor, '1000000');
  assert.equal(events.length, 1);
  assert.equal(events[0].state, 'matched');
  assert.equal(session.status, 'settled');
  assert.equal(cursors.length, 2);
  assert.ok(outbox.length <= 1);
  const report = {
    status: 'STEP07_CONFIRMED_PAYMENT_INDEXED_ONCE',
    mode,
    chainId: 1874,
    txHash,
    block: receipt.blockNumber,
    indexed,
    duplicate,
    payments,
    events,
    sessionStatus: session.status,
    cursors,
    outbox,
    externalWebhooksSent: 0,
    transactionsBroadcast: 0,
    signaturesExposed: false,
  };
  await writeFile(
    txHash === originalProof
      ? 'docs/evidence/step-07-live-index.json'
      : `docs/evidence/step-09-live-${txHash.slice(2)}.index.json`,
    JSON.stringify(report, null, 2) + '\n',
    { mode: 0o600 },
  );
  console.log(JSON.stringify(report, null, 2));
} catch {
  console.error(
    JSON.stringify({
      status: 'STOPPED',
      stage: 'Step 07 read-only chain indexing proof',
      sensitiveDetailsWithheld: true,
      transactionsBroadcast: 0,
      externalWebhooksSent: 0,
    }),
  );
  process.exitCode = 1;
} finally {
  await closeDb();
}
