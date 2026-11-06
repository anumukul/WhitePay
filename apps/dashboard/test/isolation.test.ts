import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { listPayments, DashboardApiError } from '../lib/api-client.js';
import { createApp } from '@whitepay/api';
import { createMerchant } from '@whitepay/api/src/merchants.js';
import { mintApiKey } from '@whitepay/api/src/auth.js';
import { resetDbForTests, closeDb } from '@whitepay/api/src/db.js';

let tmp: string;
let baseUrl: string;
let server: ReturnType<typeof createApp>;
let secretA: string;

before(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'dash-'));
  await resetDbForTests(join(tmp, 'api.db'));
  const a = await createMerchant({
    name: 'Dash A',
    payoutAddress: '0xa'.padEnd(42, '0'),
  });
  await createMerchant({
    name: 'Dash B',
    payoutAddress: '0xb'.padEnd(42, '0'),
  });
  secretA = (await mintApiKey(a.id)).secret;
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

test('valid API key returns empty payments list', async () => {
  const rows = await listPayments(secretA, baseUrl);
  assert.deepEqual(rows, []);
});

test('invalid API key throws 401', async () => {
  await assert.rejects(
    () => listPayments('wp_sk_bogus', baseUrl),
    (e: unknown) => e instanceof DashboardApiError && e.status === 401,
  );
});

test('missing prefix rejected before hitting API', async () => {
  await assert.rejects(
    () => listPayments('no_prefix', baseUrl),
    (e: unknown) => e instanceof DashboardApiError && e.status === 401,
  );
});
