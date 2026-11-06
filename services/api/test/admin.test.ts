import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHmac } from 'node:crypto';
import { createServer } from 'node:http';
import { createApp } from '../src/app.js';
import { resetDbForTests, closeDb } from '../src/db.js';
import { createMerchant } from '../src/merchants.js';
import { mintApiKey } from '../src/auth.js';
let app: ReturnType<typeof createApp>, base: string, a: string, b: string;
before(async () => {
  await resetDbForTests(randomUUID());
  const ma = await createMerchant({
      name: 'Owner A',
      payoutAddress: '0x' + 'a'.repeat(40),
    }),
    mb = await createMerchant({
      name: 'Owner B',
      payoutAddress: '0x' + 'b'.repeat(40),
    });
  a = (await mintApiKey(ma.id)).secret;
  b = (await mintApiKey(mb.id)).secret;
  app = createApp();
  await new Promise<void>((r) => app.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(app.address() as any).port}`;
});
after(async () => {
  if (app) await new Promise<void>((r) => app.close(() => r()));
  await closeDb();
});
const req = (
  path: string,
  body?: unknown,
  key = a,
  method = body === undefined ? 'GET' : 'POST',
) =>
  fetch(base + path, {
    method,
    headers: {
      authorization: 'Bearer ' + key,
      'content-type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
test('merchant profile is authenticated and excludes signing secret', async () => {
  assert.equal((await req('/v1/merchant', undefined, 'invalid')).status, 401);
  const res = await req('/v1/merchant');
  assert.equal(res.status, 200);
  const m = await res.json();
  assert.equal(m.name, 'Owner A');
  assert.equal(m.webhookSecret, undefined);
  assert.equal(m.webhook_secret, undefined);
});
test('product editing and new price versions preserve an existing order and tenant isolation', async () => {
  const product = await (
    await req('/v1/products', { name: 'Original' })
  ).json();
  const first = await (
    await req('/v1/prices', {
      productId: product.id,
      amountMinor: 1000000,
      currency: 'USDT',
      tokenAddress: '0xcedfb56113143d55b2358b8cfbb0deb5ad2f55a7',
    })
  ).json();
  const session = await (
    await req('/v1/checkout/sessions', {
      priceId: first.id,
      externalOrderId: 'snapshot',
    })
  ).json();
  assert.equal(
    (await req('/v1/products/' + product.id, { name: 'Renamed' }, b, 'PATCH'))
      .status,
    404,
  );
  assert.equal(
    (await req('/v1/products/' + product.id, { name: 'Renamed' }, a, 'PATCH'))
      .status,
    200,
  );
  const next = await (
    await req('/v1/prices', {
      productId: product.id,
      amountMinor: 2000000,
      currency: 'USDT',
      tokenAddress: '0xcedfb56113143d55b2358b8cfbb0deb5ad2f55a7',
    })
  ).json();
  assert.equal(next.version, 2);
  assert.equal(
    (await (await req('/v1/checkout/sessions/' + session.id)).json())
      .amountMinor,
    1000000,
  );
  for (const path of ['/v1/products', '/v1/prices', '/v1/checkout/sessions']) {
    const own = await req(path);
    assert.equal(own.status, 200);
    assert.ok((await own.json()).data.length > 0);
    assert.deepEqual((await (await req(path, undefined, b)).json()).data, []);
  }
});
test('API key creation shows its secret once, listing masks it and revocation enforces ownership', async () => {
  const res = await req('/v1/api-keys', {});
  assert.equal(res.status, 201);
  const key = await res.json();
  assert.ok(key.secret.startsWith('wp_sk_'));
  const keys = (await (await req('/v1/api-keys')).json()).data;
  assert.ok(keys.some((k: any) => k.id === key.id));
  assert.ok(!JSON.stringify(keys).includes(key.secret));
  assert.ok(
    keys.every((k: any) => k.key_hash === undefined && k.secret === undefined),
  );
  assert.equal(
    (await req('/v1/api-keys/' + key.id + '/revoke', {}, b)).status,
    404,
  );
  assert.equal((await req('/v1/merchant', undefined, key.secret)).status, 200);
  assert.equal(
    (await req('/v1/api-keys/' + key.id + '/revoke', {})).status,
    204,
  );
  assert.equal((await req('/v1/merchant', undefined, key.secret)).status, 401);
});
test('webhook configuration rejects private URLs and reveals a signing key only on creation or explicit rotation', async () => {
  for (const url of [
    'https://127.0.0.1/hook',
    'http://169.254.169.254/',
    'https://user:pass@merchant.example/hook',
    'https://localhost/hook',
  ])
    assert.equal((await req('/v1/webhook-endpoints', { url })).status, 400);
  const first = await req('/v1/webhook-endpoints', {
    url: 'https://merchant.example/hook',
  });
  assert.equal(first.status, 200);
  assert.ok((await first.json()).signingSecret);
  const view = await (await req('/v1/webhook-endpoints')).json();
  assert.equal(view.url, 'https://merchant.example/hook');
  assert.equal(view.signingSecret, undefined);
  assert.equal(
    (
      await (
        await req('/v1/webhook-endpoints', {
          url: 'https://merchant.example/new',
        })
      ).json()
    ).signingSecret,
    undefined,
  );
  assert.ok(
    (
      await (
        await req('/v1/webhook-endpoints', {
          url: 'https://merchant.example/new',
          rotateSecret: true,
        })
      ).json()
    ).signingSecret,
  );
  assert.equal(
    (await (await req('/v1/webhook-endpoints', undefined, b)).json()).url,
    null,
  );
  assert.equal((await req('/v1/webhook-endpoints/test', {})).status, 409);
});
test('approved localhost test delivery sends a signed non-payment event and records its status', async () => {
  let received = false,
    secret = '';
  const receiver = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    const expected = createHmac('sha256', secret)
      .update(String(req.headers['x-whitepay-timestamp']) + '.' + body)
      .digest('hex');
    received =
      expected === req.headers['x-whitepay-signature'] &&
      JSON.parse(body).type === 'webhook.test';
    res.writeHead(received ? 204 : 400).end();
  });
  await new Promise<void>((r) => receiver.listen(0, '127.0.0.1', r));
  const origin = `http://127.0.0.1:${(receiver.address() as any).port}`;
  const oldLocal = process.env.WHITEPAY_ALLOW_LOCAL_WEBHOOKS,
    oldOrigins = process.env.WHITEPAY_WEBHOOK_ALLOWED_ORIGINS;
  process.env.WHITEPAY_ALLOW_LOCAL_WEBHOOKS = '1';
  process.env.WHITEPAY_WEBHOOK_ALLOWED_ORIGINS = origin;
  try {
    secret = (
      await (
        await req('/v1/webhook-endpoints', {
          url: origin + '/hook',
          rotateSecret: true,
        })
      ).json()
    ).signingSecret;
    const response = await req('/v1/webhook-endpoints/test', {});
    assert.equal(response.status, 200);
    assert.equal((await response.json()).responseStatus, 204);
    assert.ok(received);
    assert.equal(
      (await (await req('/v1/webhook-endpoints')).json()).lastTest
        .responseStatus,
      204,
    );
  } finally {
    if (oldLocal === undefined)
      delete process.env.WHITEPAY_ALLOW_LOCAL_WEBHOOKS;
    else process.env.WHITEPAY_ALLOW_LOCAL_WEBHOOKS = oldLocal;
    if (oldOrigins === undefined)
      delete process.env.WHITEPAY_WEBHOOK_ALLOWED_ORIGINS;
    else process.env.WHITEPAY_WEBHOOK_ALLOWED_ORIGINS = oldOrigins;
    await new Promise<void>((r) => receiver.close(() => r()));
  }
});

test('concurrent test deliveries reserve the rate limit before making HTTP requests', async () => {
  let calls = 0;
  const receiver = createServer((_req, res) => {
    calls++;
    res.writeHead(204).end();
  });
  await new Promise<void>((r) => receiver.listen(0, '127.0.0.1', r));
  const origin = `http://127.0.0.1:${(receiver.address() as any).port}`;
  const oldLocal = process.env.WHITEPAY_ALLOW_LOCAL_WEBHOOKS,
    oldOrigins = process.env.WHITEPAY_WEBHOOK_ALLOWED_ORIGINS;
  process.env.WHITEPAY_ALLOW_LOCAL_WEBHOOKS = '1';
  process.env.WHITEPAY_WEBHOOK_ALLOWED_ORIGINS = origin;
  try {
    assert.equal(
      (await req('/v1/webhook-endpoints', { url: origin + '/hook' }, b)).status,
      200,
    );
    const results = await Promise.all([
      req('/v1/webhook-endpoints/test', {}, b),
      req('/v1/webhook-endpoints/test', {}, b),
    ]);
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 429]);
    assert.equal(calls, 1);
  } finally {
    if (oldLocal === undefined)
      delete process.env.WHITEPAY_ALLOW_LOCAL_WEBHOOKS;
    else process.env.WHITEPAY_ALLOW_LOCAL_WEBHOOKS = oldLocal;
    if (oldOrigins === undefined)
      delete process.env.WHITEPAY_WEBHOOK_ALLOWED_ORIGINS;
    else process.env.WHITEPAY_WEBHOOK_ALLOWED_ORIGINS = oldOrigins;
    await new Promise<void>((r) => receiver.close(() => r()));
  }
});
