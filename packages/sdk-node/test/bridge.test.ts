import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { WhitePay, createCheckoutBridge } from '../src/index.js';
import { createApp } from '@whitepay/api';
import { resetDbForTests, closeDb } from '@whitepay/api/src/db.js';
import { createMerchant, createPrice } from '@whitepay/api/src/merchants.js';
import { mintApiKey } from '@whitepay/api/src/auth.js';
let api: ReturnType<typeof createApp>,
  bridge: ReturnType<typeof createServer>,
  wp: WhitePay,
  origin: string,
  sessionId: string,
  otherId: string;
const payer = '0x' + 'a'.repeat(40);
before(async () => {
  await resetDbForTests(randomUUID());
  const merchant = await createMerchant({
    name: 'Bridge tests',
    payoutAddress: '0x' + 'b'.repeat(40),
  });
  const key = await mintApiKey(merchant.id);
  const price = await createPrice({
    merchantId: merchant.id,
    amountMinor: 1000000,
    currency: 'USDT',
    tokenAddress: '0xcedfb56113143d55b2358b8cfbb0deb5ad2f55a7',
  });
  api = createApp();
  await new Promise<void>((r) => api.listen(0, '127.0.0.1', r));
  wp = new WhitePay({
    secretKey: key.secret,
    apiBaseUrl: `http://127.0.0.1:${(api.address() as any).port}`,
  });
  sessionId = (
    await wp.checkout.createSession({
      priceId: price.id,
      externalOrderId: 'owned',
    })
  ).id;
  otherId = (
    await wp.checkout.createSession({
      priceId: price.id,
      externalOrderId: 'other',
    })
  ).id;
  let handler: ReturnType<typeof createCheckoutBridge>;
  bridge = createServer((req, res) => void handler(req, res));
  await new Promise<void>((r) => bridge.listen(0, '127.0.0.1', r));
  origin = `http://127.0.0.1:${(bridge.address() as any).port}`;
  process.env.WHITEPAY_CHECKOUT_CONTRACT_ADDRESS =
    '0x4d1761abb4ed290f23fcda00890039800e2e53f0';
  process.env.WHITEPAY_FEE_RECIPIENT = '0x' + 'f'.repeat(40);
  process.env.WHITEPAY_FEE_BASIS_POINTS = '10';
  process.env.WHITEPAY_QUOTE_VALIDITY_SECONDS = '900';
  handler = createCheckoutBridge({
    whitepay: wp,
    origin,
    authorizeSession: (req, id) =>
      req.headers.cookie === 'customer=A' && id === sessionId,
    checkoutAddress: process.env.WHITEPAY_CHECKOUT_CONTRACT_ADDRESS,
    feeRecipient: process.env.WHITEPAY_FEE_RECIPIENT,
    feeBasisPoints: 10,
  });
});
after(async () => {
  for (const server of [bridge, api])
    if (server) await new Promise<void>((r) => server.close(() => r()));
  await closeDb();
});
const request = (
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
) =>
  fetch(origin + '/api/whitepay/sessions/' + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      cookie: 'customer=A',
      ...(body === undefined
        ? {}
        : { origin, 'content-type': 'application/json' }),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
test('bridge fails closed without customer authorization and for another customer session', async () => {
  assert.equal(
    (await request(sessionId, undefined, { cookie: '' })).status,
    404,
  );
  assert.equal((await request(otherId)).status, 404);
});
test('bridge session response excludes merchant credentials and customer metadata', async () => {
  const response = await request(sessionId);
  assert.equal(response.status, 200);
  const raw = await response.text(),
    s = JSON.parse(raw);
  assert.equal(s.amountMinor, 1000000);
  assert.equal(s.chainId, 1874);
  assert.ok(
    !raw.includes('wp_sk_') &&
      !raw.includes('customerReference') &&
      !raw.includes('externalOrderId'),
  );
});
test('bridge rejects cross-origin writes and client-supplied prices', async () => {
  assert.equal(
    (
      await request(
        sessionId + '/quote',
        { payerAddress: payer, renew: false },
        { origin: 'https://evil.example' },
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await request(sessionId + '/quote', {
        payerAddress: payer,
        amountMinor: 1,
      })
    ).status,
    400,
  );
});
test('bridge obtains canonical quote and unconfirmed status from the actual API', async () => {
  const quote = await request(sessionId + '/quote', {
    payerAddress: payer,
    renew: false,
  });
  assert.equal(quote.status, 200);
  const q = await quote.json();
  assert.equal(q.typedData.message.amount, '1000000');
  assert.equal(q.tokenTypedData.message.value, '1001000');
  const status = await (await request(sessionId + '/status')).json();
  assert.equal(status.sessionStatus, 'open');
  assert.equal(status.payment, null);
});
test('signature submission cannot substitute a different owned merchant session', async () => {
  const other = await wp.checkout.quote(otherId, { payerAddress: payer });
  const response = await request(sessionId + '/signatures', {
    submissionId: other.submissionId,
    orderSignature: '0x' + '1'.repeat(130),
    tokenSignature: '0x' + '1'.repeat(130),
  });
  assert.equal(response.status, 404);
});
