import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { WhitePay, WhitePayAPIError } from '../src/index.js';
import { createApp } from '@whitepay/api';
import { createMerchant, createPrice } from '@whitepay/api/src/merchants.js';
import { mintApiKey } from '@whitepay/api/src/auth.js';
import { resetDbForTests, closeDb } from '@whitepay/api/src/db.js';

let tmp: string;
let baseUrl: string;
let server: ReturnType<typeof createApp>;
let secret: string;
let priceId: string;

before(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'sdk-node-'));
  await resetDbForTests(join(tmp, 'api.db'));
  const m = await createMerchant({
    name: 'SDK test',
    payoutAddress: '0x'.padEnd(42, 'a'),
  });
  secret = (await mintApiKey(m.id)).secret;
  priceId = (
    await createPrice({
      merchantId: m.id,
      amountMinor: 5_000_000,
      currency: 'USDT',
      tokenAddress: '0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7',
    })
  ).id;
  server = createApp();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  if (server?.listening)
    await new Promise<void>((resolve) => server.close(() => resolve()));
  await closeDb();
  rmSync(tmp, { recursive: true, force: true });
});

test('rejects empty secretKey', () => {
  assert.throws(() => new WhitePay({ secretKey: '' }), /secretKey required/);
});

test('createSession returns typed response from real API', async () => {
  const wp = new WhitePay({ secretKey: secret, apiBaseUrl: baseUrl });
  const session = await wp.checkout.createSession({
    priceId,
    externalOrderId: 'ord_1',
  });
  assert.ok(session.id.startsWith('cs_'));
  assert.equal(session.amountMinor, 5_000_000);
  assert.equal(session.status, 'open');
});

test('createSession with bad secret throws WhitePayAPIError 401', async () => {
  const wp = new WhitePay({ secretKey: 'wp_sk_notreal', apiBaseUrl: baseUrl });
  await assert.rejects(
    () => wp.checkout.createSession({ priceId, externalOrderId: 'ord_bad' }),
    (e: unknown) => e instanceof WhitePayAPIError && e.status === 401,
  );
});

test('webhooks.verify accepts correct signature', () => {
  const wp = new WhitePay({
    secretKey: 'wp_sk_anything_test_only',
    apiBaseUrl: baseUrl,
  });
  const payload = JSON.stringify({
    id: 'evt_1',
    type: 'payment.succeeded',
    data: {
      orderId: '0x' + '1'.repeat(64),
      quoteId: '0x' + '2'.repeat(64),
      paymentId: 'pay_test',
      sessionId: 'cs_test',
      merchantId: 'mer_test',
      amountMinor: '1000000',
      fee: '1000',
      txHash: '0x' + '3'.repeat(64),
      blockNumber: 1,
      chainId: 1874,
      currency: 'USDT',
      token: '0xcedfb56113143d55b2358b8cfbb0deb5ad2f55a7',
    },
  });
  const ts = Math.floor(Date.now() / 1000).toString();
  const sig = createHmac('sha256', 'whsec_x')
    .update(`${ts}.${payload}`)
    .digest('hex');
  const event = wp.webhooks.verify({
    payload,
    signature: sig,
    timestamp: ts,
    secret: 'whsec_x',
  });
  assert.equal(event.id, 'evt_1');
  assert.equal(event.type, 'payment.succeeded');
});

test('webhooks.verify rejects tampered payload', () => {
  const wp = new WhitePay({
    secretKey: 'wp_sk_anything_test_only',
    apiBaseUrl: baseUrl,
  });
  const payload = JSON.stringify({
    id: 'evt_1',
    type: 'payment.succeeded',
    data: {
      orderId: '0x' + '1'.repeat(64),
      quoteId: '0x' + '2'.repeat(64),
      paymentId: 'pay_test',
      sessionId: 'cs_test',
      merchantId: 'mer_test',
      amountMinor: '1000000',
      fee: '1000',
      txHash: '0x' + '3'.repeat(64),
      blockNumber: 1,
      chainId: 1874,
      currency: 'USDT',
      token: '0xcedfb56113143d55b2358b8cfbb0deb5ad2f55a7',
    },
  });
  const ts = Math.floor(Date.now() / 1000).toString();
  const sig = createHmac('sha256', 'whsec_x')
    .update(`${ts}.${payload}`)
    .digest('hex');
  assert.throws(
    () =>
      wp.webhooks.verify({
        payload: payload + 'x',
        signature: sig,
        timestamp: ts,
        secret: 'whsec_x',
      }),
    (e: unknown) =>
      e instanceof WhitePayAPIError && e.code === 'invalid_signature',
  );
});

test('idempotency header produces same session id on replay', async () => {
  const wp = new WhitePay({ secretKey: secret, apiBaseUrl: baseUrl });
  const s1 = await wp.checkout.createSession(
    { priceId, externalOrderId: 'ord_idem_a' },
    { idempotencyKey: 'k1' },
  );
  const s2 = await wp.checkout.createSession(
    { priceId, externalOrderId: 'ord_idem_a' },
    { idempotencyKey: 'k1' },
  );
  assert.equal(s1.id, s2.id);
});

test('idempotency key reuse for changed terms raises 409', async () => {
  const wp = new WhitePay({ secretKey: secret, apiBaseUrl: baseUrl });
  await wp.checkout.createSession(
    { priceId, externalOrderId: 'bound-a' },
    { idempotencyKey: 'bound-sdk' },
  );
  await assert.rejects(
    () =>
      wp.checkout.createSession(
        { priceId, externalOrderId: 'bound-b' },
        { idempotencyKey: 'bound-sdk' },
      ),
    (e: unknown) => e instanceof WhitePayAPIError && e.status === 409,
  );
});

test('customer reference survives creation and retrieval through the actual API', async () => {
  const wp = new WhitePay({ secretKey: secret, apiBaseUrl: baseUrl });
  const session = await wp.checkout.createSession({
    priceId,
    externalOrderId: 'customer-reference',
    customerReference: 'customer-1',
  });
  const loaded = await wp.checkout.retrieve(session.id);
  assert.equal(loaded.customerReference, 'customer-1');
  assert.equal(loaded.id, session.id);
});

test('SDK product, price and payments methods agree with the real API', async () => {
  const wp = new WhitePay({ secretKey: secret, apiBaseUrl: baseUrl });
  const product = await wp.products.create({ name: 'SDK product' });
  const price = await wp.prices.create({
    productId: product.id,
    amountMinor: 1000000,
    currency: 'USDT',
    tokenAddress: '0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7',
  });
  assert.equal((await wp.products.retrieve(product.id)).name, 'SDK product');
  assert.equal((await wp.prices.retrieve(price.id)).amountMinor, 1000000);
  assert.ok(Array.isArray((await wp.payments.list()).data));
});

test('idempotency binds customer reference and prevents silent reassignment', async () => {
  const wp = new WhitePay({ secretKey: secret, apiBaseUrl: baseUrl });
  const input = {
    priceId,
    externalOrderId: 'reference-idem',
    customerReference: 'one',
  };
  await wp.checkout.createSession(input, { idempotencyKey: 'reference-idem' });
  await assert.rejects(
    () =>
      wp.checkout.createSession(
        { ...input, customerReference: 'two' },
        { idempotencyKey: 'reference-idem' },
      ),
    (e: unknown) => e instanceof WhitePayAPIError && e.status === 409,
  );
  await assert.rejects(
    () => wp.checkout.createSession({ ...input, customerReference: 'two' }),
    (e: unknown) => e instanceof WhitePayAPIError && e.status === 409,
  );
});
