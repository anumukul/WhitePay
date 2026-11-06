import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { getDb } from './db.js';
import { createSession } from '@whitepay/api/src/sessions.js';
import { buildOrderForSession } from '@whitepay/api/src/orders.js';
import { runOnce } from './loop.js';
import type { ChainAdapter, RelayerConfig } from './types.js';
/** Exercise poisoned-queue defense with all network-write methods physically disabled. */
export async function proveInvalidDoesNotBroadcast(
  source: any,
  cfg: RelayerConfig,
  chain: ChainAdapter,
) {
  const sessionRow = (
    await getDb().query(
      'SELECT price_id FROM checkout_sessions WHERE id=$1 AND merchant_id=$2',
      [source.session_id, source.merchant_id],
    )
  ).rows[0];
  assert.ok(sessionRow);
  const session = await createSession({
    merchantId: source.merchant_id,
    priceId: sessionRow.price_id,
    externalOrderId: 'step06-negative-' + randomUUID(),
  });
  const quote = await buildOrderForSession({
    sessionId: session.id,
    merchantId: source.merchant_id,
    payerAddress: source.payer_address,
  });
  const poisoned = { ...quote.typedData.message, amount: '1' };
  // Deliberately bypass API admission only for this isolated negative test row. Original quote untouched.
  await getDb().query(
    "UPDATE submissions SET order_payload=$1,order_signature=$2,token_signature=$3,status='queued' WHERE id=$4",
    [
      JSON.stringify(poisoned),
      source.order_signature,
      source.token_signature,
      quote.submissionId,
    ],
  );
  let signs = 0,
    broadcasts = 0;
  const guarded: ChainAdapter = {
    ...chain,
    sign: async () => {
      signs++;
      throw new Error('negative_test_cannot_sign');
    },
    broadcast: async () => {
      broadcasts++;
      throw new Error('negative_test_cannot_broadcast');
    },
  };
  const before = {
    latest: await chain.getNonce('latest'),
    pending: await chain.getNonce('pending'),
  };
  const result = await runOnce(
    { ...cfg, mode: 'execute' },
    guarded,
    10,
    undefined,
    quote.submissionId,
  );
  assert.equal(result.details[0]?.id, quote.submissionId);
  assert.equal(result.details[0]?.reason, 'amount_mismatch');
  assert.equal(signs, 0);
  assert.equal(broadcasts, 0);
  assert.deepEqual(
    {
      latest: await chain.getNonce('latest'),
      pending: await chain.getNonce('pending'),
    },
    before,
  );
  return {
    invalidSubmissionId: quote.submissionId,
    reason: 'amount_mismatch',
    signerInvocations: signs,
    broadcastInvocations: broadcasts,
    relayerNonceUnchanged: true,
  };
}
