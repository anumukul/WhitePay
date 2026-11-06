import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { hashTypedData } from 'viem';
import { resetDbForTests, closeDb } from '../src/db.js';
import { createMerchant, createPrice } from '../src/merchants.js';
import { mintApiKey } from '../src/auth.js';
import { createSession } from '../src/sessions.js';
import { buildOrderTypedData } from '../src/orders.js';
import { createApp } from '../src/app.js';

let tmp: string;
let baseUrl: string;
let server: ReturnType<typeof createApp>;
let secretA: string;
let secretB: string;
let sessionAId: string;
let merchantAPayout: `0x${string}`;
let priceAToken: `0x${string}`;

const CHECKOUT_FIXTURE =
  '0x00000000000000000000000000000000c0000001'.toLowerCase() as `0x${string}`;
const PAYER_FIXTURE =
  '0x0000000000000000000000000000000000c0ffee' as `0x${string}`;

before(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'orders-'));
  process.env.WHITEPAY_FEE_RECIPIENT = '0x' + 'f'.repeat(40);
  process.env.WHITECHAIN_CHAIN_ID = '1874';
  process.env.WHITEPAY_FEE_BASIS_POINTS = '10';
  process.env.WHITEPAY_QUOTE_VALIDITY_SECONDS = '900';
  process.env.WHITEPAY_CHECKOUT_CONTRACT_ADDRESS = CHECKOUT_FIXTURE;
  await resetDbForTests(join(tmp, 'api.db'));

  merchantAPayout = ('0x' + 'a'.repeat(40)) as `0x${string}`;
  const a = await createMerchant({ name: 'A', payoutAddress: merchantAPayout });
  const b = await createMerchant({
    name: 'B',
    payoutAddress: ('0x' + 'b'.repeat(40)) as `0x${string}`,
  });
  secretA = (await mintApiKey(a.id)).secret;
  secretB = (await mintApiKey(b.id)).secret;

  priceAToken = '0xcedfb56113143d55b2358b8cfbb0deb5ad2f55a7' as `0x${string}`;
  const priceA = await createPrice({
    merchantId: a.id,
    amountMinor: 5_000_000,
    currency: 'USDT',
    tokenAddress: priceAToken,
  });
  const sessionA = await createSession({
    merchantId: a.id,
    priceId: priceA.id,
    externalOrderId: 'ord_1',
  });
  sessionAId = sessionA.id;

  server = createApp();
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  if (server?.listening)
    await new Promise<void>((r) => server.close(() => r()));
  await closeDb();
  rmSync(tmp, { recursive: true, force: true });
});

async function req(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${baseUrl}${path}`, init);
}

test('buildOrderTypedData produces WhitePayCheckout domain and correct field shape', () => {
  const { typedData, digest } = buildOrderTypedData({
    session: {
      id: sessionAId,
      priceId: 'price_1',
      externalOrderId: 'ord_1',
      amountMinor: 5_000_000,
      tokenAddress: priceAToken,
    },
    merchant: { id: 'mer_1', payoutAddress: merchantAPayout },
    payerAddress: PAYER_FIXTURE,
    feeBasisPoints: 10,
    validitySeconds: 900,
    checkoutContract: CHECKOUT_FIXTURE,
    chainId: 1874,
    feeRecipient: merchantAPayout,
    nowSec: 1_700_000_000,
  });
  assert.equal(typedData.domain.name, 'WhitePayCheckout');
  assert.equal(typedData.domain.version, '1');
  assert.equal(typedData.domain.chainId, 1874);
  assert.equal(typedData.domain.verifyingContract, CHECKOUT_FIXTURE);
  assert.equal(typedData.primaryType, 'Order');
  assert.equal(typedData.message.amount, '5000000');
  assert.equal(typedData.message.fee, '5000'); // 10 bps of 5,000,000
  assert.equal(typedData.message.token, priceAToken);
  assert.equal(typedData.message.merchant, merchantAPayout);
  assert.equal(typedData.message.payer, PAYER_FIXTURE);
  assert.equal(digest.length, 66);
  assert.ok(digest.startsWith('0x'));
});

test('buildOrderTypedData: recomputing with viem.hashTypedData matches returned digest', () => {
  const { typedData, digest } = buildOrderTypedData({
    session: {
      id: sessionAId,
      priceId: 'price_1',
      externalOrderId: 'ord_1',
      amountMinor: 5_000_000,
      tokenAddress: priceAToken,
    },
    merchant: { id: 'mer_1', payoutAddress: merchantAPayout },
    payerAddress: PAYER_FIXTURE,
    feeBasisPoints: 10,
    validitySeconds: 900,
    checkoutContract: CHECKOUT_FIXTURE,
    chainId: 1874,
    feeRecipient: merchantAPayout,
    nowSec: 1_700_000_000,
  });
  const recomputed = hashTypedData({
    domain: typedData.domain,
    types: { Order: typedData.types.Order },
    primaryType: 'Order',
    message: {
      ...typedData.message,
      amount: BigInt(typedData.message.amount),
      fee: BigInt(typedData.message.fee),
      validAfter: BigInt(typedData.message.validAfter),
      validBefore: BigInt(typedData.message.validBefore),
    },
  });
  assert.equal(digest, recomputed);
});

test('buildOrderTypedData: changing any field changes the digest (tamper-resistant)', () => {
  const base = buildOrderTypedData({
    session: {
      id: sessionAId,
      priceId: 'price_1',
      externalOrderId: 'ord_1',
      amountMinor: 5_000_000,
      tokenAddress: priceAToken,
    },
    merchant: { id: 'mer_1', payoutAddress: merchantAPayout },
    payerAddress: PAYER_FIXTURE,
    feeBasisPoints: 10,
    validitySeconds: 900,
    checkoutContract: CHECKOUT_FIXTURE,
    chainId: 1874,
    feeRecipient: merchantAPayout,
    nowSec: 1_700_000_000,
  });
  const tampered = buildOrderTypedData({
    session: {
      id: sessionAId,
      priceId: 'price_1',
      externalOrderId: 'ord_1',
      amountMinor: 5_000_001,
      tokenAddress: priceAToken,
    },
    merchant: { id: 'mer_1', payoutAddress: merchantAPayout },
    payerAddress: PAYER_FIXTURE,
    feeBasisPoints: 10,
    validitySeconds: 900,
    checkoutContract: CHECKOUT_FIXTURE,
    chainId: 1874,
    feeRecipient: merchantAPayout,
    nowSec: 1_700_000_000,
  });
  assert.notEqual(base.digest, tampered.digest);
});

test('POST /v1/checkout/sessions/:id/order returns typed data for merchant A', async () => {
  const r = await req(`/v1/checkout/sessions/${sessionAId}/order`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${secretA}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ payerAddress: PAYER_FIXTURE }),
  });
  assert.equal(r.status, 200);
  const body = (await r.json()) as {
    submissionId: string;
    typedData: any;
    orderDigest: string;
    status: string;
  };
  assert.ok(body.submissionId.startsWith('sub_'));
  assert.equal(body.typedData.domain.chainId, 1874);
  assert.equal(body.typedData.domain.name, 'WhitePayCheckout');
  assert.equal(body.typedData.message.amount, '5000000');
  assert.equal(body.status, 'awaiting_signature');
  assert.ok(body.orderDigest.startsWith('0x'));
});

test('POST /v1/checkout/sessions/:id/order is idempotent for same payer', async () => {
  const PAYER2 = '0x1111111111111111111111111111111111111111';
  const call = () =>
    req(`/v1/checkout/sessions/${sessionAId}/order`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${secretA}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ payerAddress: PAYER2 }),
    });
  const r1 = (await (await call()).json()) as {
    submissionId: string;
    orderDigest: string;
  };
  const r2 = (await (await call()).json()) as {
    submissionId: string;
    orderDigest: string;
  };
  assert.equal(r1.submissionId, r2.submissionId);
  assert.equal(r1.orderDigest, r2.orderDigest);
});

test("Merchant B cannot build an order for merchant A's session", async () => {
  const r = await req(`/v1/checkout/sessions/${sessionAId}/order`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${secretB}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ payerAddress: PAYER_FIXTURE }),
  });
  assert.equal(r.status, 404);
});

test('Missing payer address returns 400', async () => {
  const r = await req(`/v1/checkout/sessions/${sessionAId}/order`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${secretA}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({}),
  });
  assert.equal(r.status, 400);
});

test('POST /v1/submissions/:id/signatures accepts signatures once; second returns 409', async () => {
  // Create a fresh submission
  const account = privateKeyToAccount(generatePrivateKey());
  const PAYER3 = account.address;
  const c = (await (
    await req(`/v1/checkout/sessions/${sessionAId}/order`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${secretA}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ payerAddress: PAYER3 }),
    })
  ).json()) as any;

  const sigs = {
    orderSignature: await account.signTypedData(c.typedData),
    tokenSignature: await account.signTypedData(c.tokenTypedData),
  };
  const r1 = await req(`/v1/submissions/${c.submissionId}/signatures`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${secretA}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(sigs),
  });
  assert.equal(r1.status, 204);

  const r2 = await req(`/v1/submissions/${c.submissionId}/signatures`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${secretA}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(sigs),
  });
  assert.equal(r2.status, 409);

  // Check status progressed
  const get = await req(`/v1/submissions/${c.submissionId}`, {
    headers: { authorization: `Bearer ${secretA}` },
  });
  const row = (await get.json()) as { status: string; orderSignature: string };
  assert.equal(row.status, 'queued');
  assert.equal(row.orderSignature, undefined);
});

test('Cross-merchant signature submission returns 404', async () => {
  // A creates
  const PAYER4 = '0x3333333333333333333333333333333333333333';
  const c = (await (
    await req(`/v1/checkout/sessions/${sessionAId}/order`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${secretA}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ payerAddress: PAYER4 }),
    })
  ).json()) as { submissionId: string };
  // B tries to sign
  const r = await req(`/v1/submissions/${c.submissionId}/signatures`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${secretB}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      orderSignature: '0x' + 'ab'.repeat(65),
      tokenSignature: '0x' + 'cd'.repeat(65),
    }),
  });
  assert.equal(r.status, 404);
});

test('Missing signatures returns 400', async () => {
  const PAYER5 = '0x4444444444444444444444444444444444444444';
  const c = (await (
    await req(`/v1/checkout/sessions/${sessionAId}/order`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${secretA}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ payerAddress: PAYER5 }),
    })
  ).json()) as { submissionId: string };
  const r = await req(`/v1/submissions/${c.submissionId}/signatures`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${secretA}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ orderSignature: '0x1234' }),
  });
  assert.equal(r.status, 400);
});
