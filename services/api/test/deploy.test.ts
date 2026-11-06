import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { resetDbForTests, closeDb } from '../src/db.js';
import { createMerchant } from '../src/merchants.js';
import { mintApiKey } from '../src/auth.js';
import { createApp } from '../src/app.js';

let tmp: string;
let baseUrl: string;
let server: ReturnType<typeof createApp>;
let secret: string;
const allowed = 'https://dashboard.example';

before(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'api-deploy-'));
  await resetDbForTests(join(tmp, 'deploy.db'));
  const merchant = await createMerchant({
    name: 'Deploy Inc',
    payoutAddress: '0xd'.padEnd(42, '0'),
  });
  secret = (await mintApiKey(merchant.id)).secret;
  process.env.WHITEPAY_ALLOWED_ORIGINS = `${allowed}, https://second.example`;
  server = createApp();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  if (server?.listening)
    await new Promise<void>((resolve) => server.close(() => resolve()));
  await closeDb();
  delete process.env.WHITEPAY_ALLOWED_ORIGINS;
  rmSync(tmp, { recursive: true, force: true });
});

const req = (path: string, init: RequestInit = {}) =>
  fetch(`${baseUrl}${path}`, init);

test('liveness is unauthenticated and names the service', async () => {
  const r = await req('/health');
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true, service: 'api' });
});

test('readiness proves the database and migrations are usable', async () => {
  const r = await req('/ready');
  assert.equal(r.status, 200);
  const body = (await r.json()) as {
    ok: boolean;
    service: string;
    checks: { database: string; migrations: number };
  };
  assert.equal(body.ok, true);
  assert.equal(body.service, 'api');
  assert.equal(body.checks.database, 'up');
  assert.ok(body.checks.migrations > 0);
});

test('CORS preflight allows configured origins and rejects others', async () => {
  const ok = await req('/v1/products', {
    method: 'OPTIONS',
    headers: {
      origin: allowed,
      'access-control-request-method': 'GET',
      'access-control-request-headers': 'authorization',
    },
  });
  assert.equal(ok.status, 204);
  assert.equal(ok.headers.get('access-control-allow-origin'), allowed);
  assert.match(ok.headers.get('access-control-allow-methods') ?? '', /GET/);
  assert.equal(
    ok.headers.get('access-control-allow-headers'),
    'authorization,content-type,idempotency-key',
  );
  assert.equal(ok.headers.get('vary'), 'Origin');

  const denied = await req('/v1/products', {
    method: 'OPTIONS',
    headers: {
      origin: 'https://evil.example',
      'access-control-request-method': 'GET',
    },
  });
  assert.equal(denied.status, 403);
  assert.equal(denied.headers.get('access-control-allow-origin'), null);
});

test('CORS allows listed browser origins, denies unlisted ones, and leaves server-to-server calls open', async () => {
  const browser = await req('/v1/products', {
    headers: { authorization: `Bearer ${secret}`, origin: allowed },
  });
  assert.equal(browser.status, 200);
  assert.equal(browser.headers.get('access-control-allow-origin'), allowed);

  const denied = await req('/v1/products', {
    headers: { authorization: `Bearer ${secret}`, origin: 'https://evil.example' },
  });
  assert.equal(denied.status, 403);
  assert.equal(denied.headers.get('access-control-allow-origin'), null);

  const serverToServer = await req('/v1/products', {
    headers: { authorization: `Bearer ${secret}` },
  });
  assert.equal(serverToServer.status, 200);
  assert.equal(serverToServer.headers.get('access-control-allow-origin'), null);
});

test('readiness fails closed when the database is unreachable', async () => {
  await closeDb();
  const good = process.env.DATABASE_URL;
  process.env.DATABASE_URL =
    'postgresql://nobody:nobody@127.0.0.1:1/unreachable';
  try {
    const r = await req('/ready');
    assert.equal(r.status, 503);
    const body = (await r.json()) as {
      ok: boolean;
      checks: { database: string };
    };
    assert.equal(body.ok, false);
    assert.equal(body.checks.database, 'down');
  } finally {
    if (good === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = good;
    await closeDb();
  }
});
