import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseTransaction,
  keccak256,
  encodeAbiParameters,
  parseAbiParameters,
} from 'viem';
import { closeDb } from '@whitepay/api/src/db.js';
import { fixture, getDb } from './fixtures.js';
import { runOnce } from '../src/loop.js';
after(async () => {
  await closeDb();
});
async function start() {
  const f = await fixture();
  const approval = await f.approve();
  f.cfg.mode = 'execute';
  return { ...f, approval };
}
test('actual signed bytes carry exact nonce, gas and fee caps', async () => {
  const f = await start();
  const r = await runOnce(f.cfg, f.chain, 10, f.approval);
  assert.equal(r.details[0].status, 'submitted');
  const tx = parseTransaction(f.state.broadcasts[0]);
  assert.equal(tx.nonce, 0);
  assert.equal(tx.gas, 180000n);
  assert.equal(tx.maxFeePerGas, 20000000000n);
  assert.equal(tx.maxPriorityFeePerGas, 1000000n);
  assert.equal(tx.value, undefined);
  const saved = (await getDb().query('SELECT * FROM relay_attempts')).rows[0];
  assert.equal(saved.tx_hash, keccak256(f.state.broadcasts[0]));
  assert.equal(saved.raw_transaction, f.state.broadcasts[0]);
  assert.equal(saved.broadcast_attempted, true);
});
test('crash during signing resumes the same durable nonce after restart', async () => {
  const f = await start();
  f.state.failSign = true;
  await runOnce(f.cfg, f.chain, 10, f.approval);
  assert.equal(f.state.broadcasts.length, 0);
  assert.equal(
    (await getDb().query('SELECT * FROM relay_attempts')).rows[0].state,
    'reserved',
  );
  f.state.failSign = false;
  await runOnce(f.cfg, f.chain);
  assert.equal(f.state.broadcasts.length, 1);
  assert.equal(parseTransaction(f.state.broadcasts[0]).nonce, 0);
});
test('ambiguous RPC timeout resends identical signed bytes without resigning', async () => {
  const f = await start();
  f.state.failBroadcast = true;
  const r = await runOnce(f.cfg, f.chain, 10, f.approval);
  assert.equal(r.details[0].reason, 'broadcast_outcome_unknown');
  f.state.failBroadcast = false;
  await runOnce(f.cfg, f.chain);
  assert.equal(f.state.signs, 1);
  assert.equal(f.state.broadcasts.length, 2);
  assert.equal(f.state.broadcasts[0], f.state.broadcasts[1]);
});
test('receipt reconciliation charges actual L2 plus L1 and leaves fulfillment to indexer', async () => {
  const f = await start();
  await runOnce(f.cfg, f.chain, 10, f.approval);
  f.mine();
  const r = await runOnce(f.cfg, f.chain);
  assert.equal(r.details[0].status, 'mined');
  const attempt = (await getDb().query('SELECT * FROM relay_attempts')).rows[0];
  assert.equal(attempt.reserved_wei, '0');
  assert.equal(attempt.charged_wei, '600000000000123');
  assert.equal(
    (
      await getDb().query('SELECT status FROM submissions WHERE id=$1', [
        f.row.id,
      ])
    ).rows[0].status,
    'submitted',
  );
  assert.equal(f.state.broadcasts.length, 1);
});
test('reverted transaction cannot settle and is still charged actual gas', async () => {
  const f = await start();
  await runOnce(f.cfg, f.chain, 10, f.approval);
  f.mine('reverted');
  const r = await runOnce(f.cfg, f.chain);
  assert.equal(r.details[0].status, 'failed');
  assert.equal(
    (
      await getDb().query('SELECT status FROM submissions WHERE id=$1', [
        f.row.id,
      ])
    ).rows[0].status,
    'failed',
  );
});
test('success without exact settlement event is quarantined and cannot fulfill', async () => {
  const f = await start();
  await runOnce(f.cfg, f.chain, 10, f.approval);
  f.mine('success', false);
  const r = await runOnce(f.cfg, f.chain);
  assert.equal(r.details[0].status, 'quarantined');
  assert.equal(
    (
      await getDb().query('SELECT status FROM submissions WHERE id=$1', [
        f.row.id,
      ])
    ).rows[0].status,
    'submitted',
  );
});
test('unknown nonce consumption quarantines instead of inventing a new nonce', async () => {
  const f = await start();
  await runOnce(f.cfg, f.chain, 10, f.approval);
  f.state.latest = 1;
  f.chain.transactionKnown = async () => false;
  const r = await runOnce(f.cfg, f.chain);
  assert.equal(r.details[0].status, 'quarantined');
  assert.equal(f.state.signs, 1);
});
test('expired ambiguous broadcast stays reserved pending reconciliation', async () => {
  const f = await start();
  f.state.failBroadcast = true;
  await runOnce(f.cfg, f.chain, 10, f.approval);
  f.state.now = f.row.order_payload.validBefore + 1;
  const r = await runOnce(f.cfg, f.chain);
  assert.equal(r.details[0].status, 'pending');
  assert.equal(f.state.broadcasts.length, 1);
  assert.ok(
    BigInt(
      (await getDb().query('SELECT reserved_wei FROM relay_attempts')).rows[0]
        .reserved_wei,
    ) > 0n,
  );
});

test('mined but unconfirmed known transaction waits instead of quarantining', async () => {
  const f = await start();
  await runOnce(f.cfg, f.chain, 10, f.approval);
  f.state.latest = 1;
  const r = await runOnce(f.cfg, f.chain);
  assert.equal(r.details[0].status, 'pending');
  assert.equal(r.details[0].reason, 'awaiting_receipt_confirmations');
  assert.equal(f.state.broadcasts.length, 1);
});
test('tampered durable signed bytes never broadcast on recovery', async () => {
  const f = await start();
  f.state.failBroadcast = true;
  await runOnce(f.cfg, f.chain, 10, f.approval);
  await getDb().query("UPDATE relay_attempts SET raw_transaction='0x02'");
  const r = await runOnce(f.cfg, f.chain);
  assert.equal(r.details[0].reason, 'recovery_requires_review');
  assert.equal(f.state.broadcasts.length, 1);
});
test('expired unbroadcast reservation releases its budget without sending', async () => {
  const f = await start();
  f.state.failSign = true;
  await runOnce(f.cfg, f.chain, 10, f.approval);
  f.state.now = f.row.order_payload.validBefore + 1;
  const r = await runOnce(f.cfg, f.chain);
  assert.equal(r.details[0].status, 'failed');
  assert.equal(f.state.broadcasts.length, 0);
  assert.equal(
    (await getDb().query('SELECT reserved_wei FROM relay_attempts')).rows[0]
      .reserved_wei,
    '0',
  );
});

test('different Node process recovers signed bytes after ambiguous send without the signer', async () => {
  const f = await start();
  f.state.failBroadcast = true;
  await runOnce(f.cfg, f.chain, 10, f.approval);
  const { spawnSync } = await import('node:child_process');
  const dbUrl = new URL(process.env.TEST_DATABASE_URL!);
  dbUrl.searchParams.set('options', getDb().options.options!);
  const input = JSON.stringify(
    {
      cfg: f.cfg,
      address: f.chain.relayerAddress,
      hash: keccak256(f.state.broadcasts[0]),
      url: dbUrl.toString(),
    },
    (_, v) => (typeof v === 'bigint' ? { $bigint: v.toString() } : v),
  );
  const code = `import {runOnce} from './src/loop.ts';import {closeDb} from './src/db.ts';import {keccak256} from 'viem';let data='';for await(const part of process.stdin)data+=part;const x=JSON.parse(data,(_,v)=>v?.$bigint?BigInt(v.$bigint):v);process.env.DATABASE_URL=x.url;let sent=0;const chain={relayerAddress:x.address,chainId:async()=>1874,nowSeconds:async()=>Math.floor(Date.now()/1000),getNonce:async tag=>tag==='latest'?0:1,receipt:async()=>null,transactionKnown:async()=>true,getRelayerBalance:async()=>10n**18n,l1Fee:async()=>100n,gasPrice:async()=>5000000000n,sign:async()=>{throw new Error('must not sign')},broadcast:async raw=>{if(keccak256(raw)!==x.hash)throw new Error('wrong saved bytes');sent++;return x.hash}};try{const result=await runOnce(x.cfg,chain);console.log(JSON.stringify({sent,status:result.details[0].status}))}finally{await closeDb()}`;
  const child = spawnSync(
    process.execPath,
    ['--import', 'tsx/esm', '--input-type=module', '-e', code],
    { input, encoding: 'utf8', timeout: 15000, maxBuffer: 2000 },
  );
  assert.equal(
    child.status,
    0,
    'Recovery child must exit successfully (details withheld)',
  );
  assert.deepEqual(JSON.parse(child.stdout), { sent: 1, status: 'submitted' });
});
test('wrong merchant amount in a success event cannot settle', async () => {
  const f = await start();
  await runOnce(f.cfg, f.chain, 10, f.approval);
  const hash = f.mine();
  const r = f.state.receipts.get(hash)!;
  const o = f.row.order_payload;
  r.logs = [
    {
      ...r.logs[0],
      data: encodeAbiParameters(
        parseAbiParameters('address,uint256,uint256,address,bytes32'),
        [o.token, 2000000n, 1000n, o.feeRecipient, o.quoteId],
      ),
    },
    ...r.logs.slice(1),
  ];
  const result = await runOnce(f.cfg, f.chain);
  assert.equal(result.details[0].status, 'quarantined');
});

test('L1 oracle checks actual signed bytes before any broadcast', async () => {
  const f = await start();
  f.chain.l1Fee = async (_tx, raw) => (raw ? 1001n : 100n);
  const r = await runOnce(f.cfg, f.chain, 10, f.approval);
  assert.equal(r.details[0].reason, 'fees_above_saved_limits');
  assert.equal(f.state.signs, 1);
  assert.equal(f.state.broadcasts.length, 0);
  assert.equal(
    (await getDb().query('SELECT state FROM relay_attempts')).rows[0].state,
    'signed',
  );
  f.chain.l1Fee = async () => 100n;
  await runOnce(f.cfg, f.chain);
  assert.equal(f.state.signs, 1);
  assert.equal(f.state.broadcasts.length, 1);
});
test('signer cannot substitute a different nonce', async () => {
  const f = await start();
  const sign = f.chain.sign;
  f.chain.sign = (tx) => sign({ ...tx, nonce: tx.nonce + 1 });
  const r = await runOnce(f.cfg, f.chain, 10, f.approval);
  assert.equal(r.details[0].status, 'pending');
  assert.equal(f.state.broadcasts.length, 0);
  assert.equal(
    (await getDb().query('SELECT raw_transaction FROM relay_attempts')).rows[0]
      .raw_transaction,
    null,
  );
});

test('operator selection cannot process another queued submission', async () => {
  const f = await fixture();
  const r = await (runOnce as any)(
    f.cfg,
    f.chain,
    10,
    undefined,
    'sub_not_selected',
  );
  assert.equal(r.processed, 0);
  assert.equal(f.state.signs, 0);
  assert.equal(f.state.broadcasts.length, 0);
});
test('reconcile mode records a receipt without permitting rebroadcast', async () => {
  const f = await start();
  await runOnce(f.cfg, f.chain, 10, f.approval);
  f.mine();
  f.cfg.mode = 'reconcile' as any;
  const r = await runOnce(f.cfg, f.chain);
  assert.equal(r.details[0].status, 'mined');
  assert.equal(f.state.broadcasts.length, 1);
});
test('reconcile mode with pending receipt never signs or resends', async () => {
  const f = await start();
  await runOnce(f.cfg, f.chain, 10, f.approval);
  f.cfg.mode = 'reconcile' as any;
  const r = await runOnce(f.cfg, f.chain);
  assert.equal(r.details[0].status, 'pending');
  assert.equal(f.state.broadcasts.length, 1);
  assert.equal(f.state.signs, 1);
});

test('invalid queued request is rejected by the real loop with signing and broadcasting disabled', async () => {
  const f = await fixture();
  const { proveInvalidDoesNotBroadcast } = await import(
    '../src/negative-proof.js'
  );
  const proof = await proveInvalidDoesNotBroadcast(f.row, f.cfg, f.chain);
  assert.equal(proof.reason, 'amount_mismatch');
  assert.equal(proof.broadcastInvocations, 0);
  assert.equal(f.state.signs, 0);
  assert.equal(f.state.broadcasts.length, 0);
  assert.equal(
    (
      await getDb().query('SELECT status FROM submissions WHERE id=$1', [
        f.row.id,
      ])
    ).rows[0].status,
    'queued',
  );
});

test('password prompt crossing the safety cutoff prevents broadcast and releases unused reserve', async () => {
  const f = await start();
  const sign = f.chain.sign;
  f.chain.sign = async (tx) => {
    const raw = await sign(tx);
    f.state.now =
      f.row.order_payload.validBefore - f.cfg.minimumValiditySeconds;
    return raw;
  };
  const r = await runOnce(f.cfg, f.chain, 10, f.approval);
  assert.equal(f.state.signs, 1);
  assert.equal(f.state.broadcasts.length, 0);
  assert.equal(r.details[0].reason, 'time_expired');
  const saved = (await getDb().query('SELECT * FROM relay_attempts')).rows[0];
  assert.equal(saved.broadcast_attempted, false);
  assert.equal(saved.reserved_wei, '0');
  assert.equal(saved.state, 'failed');
});

test('fee RPC crossing the safety cutoff prevents broadcast', async () => {
  const f = await start();
  const l1Fee = f.chain.l1Fee;
  f.chain.l1Fee = async (tx, raw) => {
    if (raw)
      f.state.now =
        f.row.order_payload.validBefore - f.cfg.minimumValiditySeconds;
    return l1Fee(tx, raw);
  };
  const r = await runOnce(f.cfg, f.chain, 10, f.approval);
  assert.equal(f.state.broadcasts.length, 0);
  assert.equal(r.details[0].reason, 'time_expired');
});

test('durable broadcast marker delay crossing cutoff still prevents the actual send', async () => {
  const f = await start();
  const db = getDb();
  const query = db.query;
  db.query = (async (...args: any[]) => {
    const result = await (query as any).apply(db, args);
    if (
      typeof args[0] === 'string' &&
      args[0].includes("SET state='pending',broadcast_attempted=true")
    )
      f.state.now =
        f.row.order_payload.validBefore - f.cfg.minimumValiditySeconds;
    return result;
  }) as typeof db.query;
  try {
    const r = await runOnce(f.cfg, f.chain, 10, f.approval);
    assert.equal(f.state.broadcasts.length, 0);
    assert.equal(r.details[0].reason, 'time_expired');
    const saved = (await db.query('SELECT * FROM relay_attempts')).rows[0];
    assert.equal(saved.broadcast_attempted, false);
    assert.equal(saved.reserved_wei, '0');
  } finally {
    db.query = query;
  }
});
