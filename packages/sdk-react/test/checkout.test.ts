import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashTypedData } from 'viem';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import { buildOrderTypedData } from '@whitepay/api/src/orders.js';
import {
  validateCheckoutQuote,
  prepareCheckout,
  signCheckout,
  confirmedPayment,
} from '../src/checkout.js';
export function fixture() {
  const now = Math.floor(Date.now() / 1000),
    account = privateKeyToAccount(generatePrivateKey());
  const session = {
    id: 'cs_test',
    status: 'open' as const,
    amountMinor: 1000000,
    currency: 'USDT' as const,
    tokenAddress: '0xcedfb56113143d55b2358b8cfbb0deb5ad2f55a7',
    payoutAddress: '0x' + 'b'.repeat(40),
    chainId: 1874,
    checkoutAddress: '0x4d1761abb4ed290f23fcda00890039800e2e53f0',
    feeRecipient: '0x' + 'f'.repeat(40),
    feeBasisPoints: 10,
    minimumValiditySeconds: 120,
  };
  const { typedData, digest } = buildOrderTypedData({
    session: {
      ...session,
      priceId: 'price_test',
      externalOrderId: 'order_test',
    },
    merchant: { id: 'mer_test', payoutAddress: session.payoutAddress },
    payerAddress: account.address,
    feeBasisPoints: 10,
    validitySeconds: 900,
    checkoutContract: session.checkoutAddress as any,
    chainId: 1874,
    feeRecipient: session.feeRecipient as any,
    nowSec: now,
  });
  const tokenTypedData = {
    domain: {
      name: 'Tether USD',
      version: '1',
      chainId: 1874,
      verifyingContract: session.tokenAddress,
    },
    primaryType: 'ReceiveWithAuthorization',
    types: {
      EIP712Domain: typedData.types.EIP712Domain,
      ReceiveWithAuthorization: [
        { name: 'from', type: 'address' },
        { name: 'to', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'validAfter', type: 'uint256' },
        { name: 'validBefore', type: 'uint256' },
        { name: 'nonce', type: 'bytes32' },
      ],
    },
    message: {
      from: account.address,
      to: session.checkoutAddress,
      value: '1001000',
      validAfter: typedData.message.validAfter,
      validBefore: typedData.message.validBefore,
      nonce: digest,
    },
  };
  const quote = {
    submissionId: 'sub_test',
    orderDigest: digest,
    typedData,
    tokenTypedData,
  };
  const calls: string[] = [],
    signed: any[] = [];
  const provider = {
    request: async ({ method, params }: any) => {
      calls.push(method);
      if (method === 'eth_requestAccounts' || method === 'eth_accounts')
        return [account.address];
      if (method === 'eth_chainId') return '0x752';
      if (method === 'eth_call')
        return '0x' + 2000000n.toString(16).padStart(64, '0');
      if (method === 'eth_signTypedData_v4') {
        const td = JSON.parse(params[1]);
        signed.push(td);
        return account.signTypedData(td);
      }
      throw new Error('unexpected_wallet_call');
    },
  };
  const submissions: any[] = [];
  const backend = {
    session: async () => session,
    quote: async () => quote,
    submit: async (...args: any[]) => {
      submissions.push(args);
    },
    status: async () => ({ sessionStatus: 'open', payment: null }),
  };
  return {
    now,
    account,
    session,
    quote,
    calls,
    signed,
    provider,
    backend,
    submissions,
  };
}
test('quote review exposes exact 1-USDT price, .001 fee and 1.001 total', () => {
  const f = fixture(),
    v = validateCheckoutQuote(f.quote, f.session, f.account.address, f.now);
  assert.equal(v.amount, '1');
  assert.equal(v.fee, '0.001');
  assert.equal(v.total, '1.001');
});
for (const field of [
  'amount',
  'fee',
  'merchant',
  'feeRecipient',
  'token',
  'payer',
  'quoteId',
])
  test(`rejects altered ${field} before wallet signing`, () => {
    const f = fixture(),
      q = structuredClone(f.quote);
    (q.typedData.message as any)[field] =
      field === 'amount'
        ? '2000000'
        : field === 'fee'
          ? '500000'
          : field === 'quoteId'
            ? '0x' + '9'.repeat(64)
            : '0x' + '9'.repeat(40);
    assert.throws(() =>
      validateCheckoutQuote(q, f.session, f.account.address, f.now),
    );
  });
test('rejects token total, nonce, receiver, chain, domain and signing-schema substitutions', () => {
  for (const change of [
    (q: any) => (q.tokenTypedData.message.value = '2'),
    (q: any) => (q.tokenTypedData.message.nonce = '0x' + '1'.repeat(64)),
    (q: any) => (q.tokenTypedData.message.to = '0x' + '1'.repeat(40)),
    (q: any) => (q.typedData.domain.chainId = 1),
    (q: any) => (q.tokenTypedData.domain.name = 'Other'),
    (q: any) => q.typedData.types.Order.reverse(),
  ]) {
    const f = fixture(),
      q = structuredClone(f.quote);
    change(q);
    assert.throws(() =>
      validateCheckoutQuote(q, f.session, f.account.address, f.now),
    );
  }
});
test('two-minute cutoff rejects its exact boundary', () => {
  const f = fixture();
  assert.throws(
    () =>
      validateCheckoutQuote(
        f.quote,
        f.session,
        f.account.address,
        f.quote.typedData.message.validBefore - 120,
      ),
    /expired/,
  );
});
test('wrong chain fails preparation without either signature', async () => {
  const f = fixture(),
    request = f.provider.request;
  f.provider.request = async (args: any) =>
    args.method === 'eth_chainId' ? '0x1' : request(args);
  await assert.rejects(
    () => prepareCheckout(f.backend, f.provider, 'cs_test'),
    /wrong_chain/,
  );
  assert.equal(f.signed.length, 0);
});
test('valid flow signs two exact typed data payloads and never requests a transaction', async () => {
  const f = fixture(),
    prepared = await prepareCheckout(f.backend, f.provider, 'cs_test');
  await signCheckout(prepared, f.provider, f.backend);
  assert.equal(f.signed.length, 2);
  assert.equal(hashTypedData(f.signed[0]), f.quote.orderDigest);
  assert.equal(f.submissions.length, 1);
  assert.ok(
    !f.calls.some((m) => m.includes('send') || m.includes('Transaction')),
  );
});
test('rejected first signature submits nothing', async () => {
  const f = fixture(),
    request = f.provider.request;
  f.provider.request = async (args: any) => {
    if (args.method === 'eth_signTypedData_v4') throw { code: 4001 };
    return request(args);
  };
  const p = await prepareCheckout(f.backend, f.provider, 'cs_test');
  await assert.rejects(
    () => signCheckout(p, f.provider, f.backend),
    /signature_rejected/,
  );
  assert.equal(f.submissions.length, 0);
});
test('account change after review prevents signing', async () => {
  const f = fixture(),
    prepared = await prepareCheckout(f.backend, f.provider, 'cs_test'),
    request = f.provider.request;
  f.provider.request = async (args: any) =>
    args.method === 'eth_accounts' ? ['0x' + '1'.repeat(40)] : request(args);
  await assert.rejects(
    () => signCheckout(prepared, f.provider, f.backend),
    /wallet_changed/,
  );
  assert.equal(f.signed.length, 0);
});
test('pending transaction and browser callbacks cannot fabricate confirmation', () => {
  const f = fixture();
  assert.equal(
    confirmedPayment({ sessionStatus: 'open', payment: null }, f.session),
    null,
  );
  const payment = {
    id: 'pay_test',
    sessionId: 'other',
    status: 'succeeded',
    amountMinor: 1000000,
    txHash: '0x' + '1'.repeat(64),
    blockNumber: 1,
  };
  assert.throws(() =>
    confirmedPayment({ sessionStatus: 'settled', payment }, f.session),
  );
  assert.equal(
    confirmedPayment(
      {
        sessionStatus: 'settled',
        payment: { ...payment, sessionId: f.session.id },
      },
      f.session,
    )?.paymentId,
    'pay_test',
  );
});

test('cancelling a checkout while its wallet prompt is open prevents submission', async () => {
  const f = fixture(),
    p = await prepareCheckout(f.backend, f.provider, 'cs_test'),
    request = f.provider.request;
  let active = true;
  f.provider.request = async (args: any) => {
    const result = await request(args);
    if (args.method === 'eth_signTypedData_v4') active = false;
    return result;
  };
  await assert.rejects(
    () => signCheckout(p, f.provider, f.backend, () => active),
    /checkout_cancelled/,
  );
  assert.equal(f.submissions.length, 0);
  assert.equal(f.signed.length, 1);
});
