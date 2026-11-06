import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashTypedData, keccak256, toHex } from 'viem';
import { buildOrderTypedData } from '@whitepay/api/src/orders.js';
import {
  LIVE_POLICY,
  LIVE_ROLES,
  LIVE_CHECKOUT,
  LIVE_TOKEN,
  validateLiveContext,
  requireApprovalHash,
  requireLiveContextBasename,
} from '../src/live-policy.js';
function context() {
  const now = Math.floor(Date.now() / 1000);
  const { typedData, digest } = buildOrderTypedData({
    session: {
      id: 'cs_policy',
      priceId: 'price_policy',
      externalOrderId: 'proof',
      amountMinor: 1000000,
      tokenAddress: LIVE_TOKEN,
    },
    merchant: { id: 'mer_policy', payoutAddress: LIVE_ROLES.merchant },
    payerAddress: LIVE_ROLES.payer,
    feeBasisPoints: 10,
    validitySeconds: 900,
    checkoutContract: LIVE_CHECKOUT,
    chainId: 1874,
    feeRecipient: LIVE_ROLES.feeRecipient,
    nowSec: now,
  });
  const receive = [
    ['from', 'address'],
    ['to', 'address'],
    ['value', 'uint256'],
    ['validAfter', 'uint256'],
    ['validBefore', 'uint256'],
    ['nonce', 'bytes32'],
  ].map(([name, type]) => ({ name, type }));
  const tokenTypedData = {
    domain: {
      name: 'Tether USD',
      version: '1',
      chainId: 1874,
      verifyingContract: LIVE_TOKEN,
    },
    types: {
      EIP712Domain: typedData.types.EIP712Domain,
      ReceiveWithAuthorization: receive,
    },
    primaryType: 'ReceiveWithAuthorization',
    message: {
      from: LIVE_ROLES.payer,
      to: LIVE_CHECKOUT,
      value: '1001000',
      validAfter: typedData.message.validAfter,
      validBefore: typedData.message.validBefore,
      nonce: digest,
    },
  };
  return {
    version: 1,
    chainId: 1874,
    checkout: LIVE_CHECKOUT,
    token: LIVE_TOKEN,
    policy: LIVE_POLICY,
    roles: LIVE_ROLES,
    orderTypedData: typedData,
    tokenTypedData,
    orderDigest: digest,
    tokenDigest: hashTypedData(tokenTypedData as any),
    validBefore: typedData.message.validBefore,
  };
}
test('live context accepts exactly the user-selected 1.001-USDT / 15-minute policy', () => {
  validateLiveContext(context());
});
test('live context rejects financial, chain, domain, role, window and policy substitutions', () => {
  for (const change of [
    (c: any) => (c.orderTypedData.message.amount = '1'),
    (c: any) => (c.orderTypedData.message.fee = '0'),
    (c: any) => (c.chainId = 1),
    (c: any) => (c.roles.payer = LIVE_ROLES.merchant),
    (c: any) => (c.tokenTypedData.domain.verifyingContract = LIVE_CHECKOUT),
    (c: any) => (c.policy.maxGasPriceWei = '21000000000'),
    (c: any) => (c.validBefore += 1),
    (c: any) => c.tokenTypedData.types.ReceiveWithAuthorization.pop(),
  ]) {
    const c = structuredClone(context());
    change(c);
    assert.throws(() => validateLiveContext(c));
  }
});
test('operator signing and execution approval require the exact displayed public hash', () => {
  const expected = keccak256(toHex('reviewed transaction'));
  assert.throws(() => requireApprovalHash(undefined, expected));
  assert.throws(() =>
    requireApprovalHash(keccak256(toHex('different transaction')), expected),
  );
  requireApprovalHash(expected, expected);
});

test('live context accepts PostgreSQL JSONB object-key ordering without changing EIP712 field order', () => {
  const c = context();
  c.orderTypedData.types = {
    Order: c.orderTypedData.types.Order,
    EIP712Domain: c.orderTypedData.types.EIP712Domain,
  };
  c.tokenTypedData.types = {
    ReceiveWithAuthorization: c.tokenTypedData.types.ReceiveWithAuthorization,
    EIP712Domain: c.tokenTypedData.types.EIP712Domain,
  };
  validateLiveContext(c);
});

test('two-minute signing cutoff rejects the exact boundary and expired quotes without renewal', async () => {
  const { requireSigningWindow, checkSigningWindow, SigningWindowClosed } =
    await import('../src/live-policy.js');
  requireSigningWindow(1000, 879, 120);
  for (const now of [880, 881, 1000, 1001])
    assert.throws(
      () => requireSigningWindow(1000, now, 120),
      (e) =>
        e instanceof SigningWindowClosed && e.code === 'SIGNING_WINDOW_CLOSED',
    );
  assert.equal(checkSigningWindow(1000, 880, 120).permitted, false);
  assert.equal(checkSigningWindow(1000, 879, 120).permitted, true);
});

test('operator permits reviewed Step 06 and Step 09 context names but rejects other paths', () => {
  for (const step of ['06', '09'])
    assert.doesNotThrow(() =>
      requireLiveContextBasename(`step-${step}-live-${'a'.repeat(64)}.json`),
    );
  for (const name of [
    'step-10-live-' + 'a'.repeat(64) + '.json',
    '../step-09-live-' + 'a'.repeat(64) + '.json',
    'step-09-live-a.json',
    'step-09-live-' + 'a'.repeat(64) + '.json.transaction-preview.json',
  ])
    assert.throws(() => requireLiveContextBasename(name));
});
