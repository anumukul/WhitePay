import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHmac } from 'node:crypto';
import { WhitePay, WhitePayAPIError } from '../src/index.js';
const server = createServer((req, res) => {
  if (req.url === '/v1/checkout/sessions/cs_slow') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.write('{');
    return;
  }
  if (req.url === '/v1/checkout/sessions/cs_bad') {
    res.writeHead(200).end('<html>bad</html>');
    return;
  }
  if (req.url === '/v1/checkout/sessions/cs_redirect') {
    res.writeHead(302, { location: origin + '/capture' }).end();
    return;
  }
  if (req.url === '/capture') {
    captured++;
    res.end('{}');
    return;
  }
  res.writeHead(503).end(
    JSON.stringify({
      error: 'internal',
      message: 'do-not-reflect-this-response',
    }),
  );
});
let captured = 0;
await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${(server.address() as any).port}`;
after(async () => {
  server.closeAllConnections();
  await new Promise<void>((r) => server.close(() => r()));
});
const wp = () =>
  new WhitePay({ secretKey: 'synthetic', apiBaseUrl: origin, timeoutMs: 40 });
const error = (code: string) => (e: unknown) =>
  e instanceof WhitePayAPIError && e.code === code;
test('API destination must be explicitly configured before attaching credentials', () => {
  assert.throws(() => new WhitePay({ secretKey: 'synthetic' }), /apiBaseUrl/);
  for (const apiBaseUrl of [
    'https://user:pass@example.com',
    'https://example.com/?x=1',
    'https://example.com/#x',
    'file:///tmp/api',
  ])
    assert.throws(
      () => new WhitePay({ secretKey: 'synthetic', apiBaseUrl }),
      /apiBaseUrl/,
    );
});
test('timeout covers the full response body', async () => {
  await assert.rejects(
    () => wp().checkout.retrieve('cs_slow'),
    error('timeout'),
  );
});
test('invalid JSON response yields a sanitized typed error', async () => {
  await assert.rejects(
    () => wp().checkout.retrieve('cs_bad'),
    error('invalid_response'),
  );
});
test('redirects never forward merchant credentials', async () => {
  await assert.rejects(
    () => wp().checkout.retrieve('cs_redirect'),
    error('network_error'),
  );
  assert.equal(captured, 0);
});
test('HTTP errors do not reflect arbitrary upstream messages', async () => {
  await assert.rejects(
    () => wp().payments.retrieve('pay_missing'),
    (e: unknown) =>
      e instanceof WhitePayAPIError &&
      e.status === 503 &&
      !e.message.includes('do-not-reflect'),
  );
});
function signed(
  timestamp: string,
  payload = '{"id":"evt","type":"test.event","data":{}}',
) {
  return {
    timestamp,
    payload,
    secret: 'test-only',
    signature: createHmac('sha256', 'test-only')
      .update(`${timestamp}.${payload}`)
      .digest('hex'),
  };
}
test('webhook freshness rejects stale and future timestamps despite valid HMAC', () => {
  for (const timestamp of ['1', String(Math.floor(Date.now() / 1000) + 3600)])
    assert.throws(
      () => wp().webhooks.verify(signed(timestamp)),
      error('invalid_timestamp'),
    );
});
test('webhook rejects hex suffixes, malformed JSON and missing data', () => {
  const good = signed(String(Math.floor(Date.now() / 1000)));
  assert.throws(
    () => wp().webhooks.verify({ ...good, signature: good.signature + 'zz' }),
    error('invalid_signature'),
  );
  for (const payload of ['{', '{"id":"evt","type":"payment.succeeded"}'])
    assert.throws(
      () => wp().webhooks.verify(signed(good.timestamp, payload)),
      error('invalid_payload'),
    );
});

test('constructor refuses browser execution without sending credentials', () => {
  const global = globalThis as any;
  const old = global.window;
  global.window = {};
  try {
    assert.throws(() => wp(), /must not be used in the browser/);
  } finally {
    if (old === undefined) delete global.window;
    else global.window = old;
  }
});
