import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createDashboardSession,
  getDashboardSession,
  deleteDashboardSession,
  dashboardCookieOptions,
} from '../lib/session.js';
test('dashboard cookies are opaque and expire without exposing an API key', () => {
  const key = 'synthetic-server-key',
    token = createDashboardSession(key, 0);
  assert.ok(!token.includes(key));
  assert.equal(getDashboardSession(token, 1)?.apiKey, key);
  assert.equal(getDashboardSession('forged', 1), null);
  assert.equal(getDashboardSession(token, 8 * 60 * 60 * 1000 + 1), null);
});
test('logout invalidates only its own merchant session', () => {
  const a = createDashboardSession('owner-a'),
    b = createDashboardSession('owner-b');
  deleteDashboardSession(a);
  assert.equal(getDashboardSession(a), null);
  assert.equal(getDashboardSession(b)?.apiKey, 'owner-b');
});
test('production session cookies are HttpOnly Secure and SameSite Strict', () => {
  const options = dashboardCookieOptions(true);
  assert.equal(options.httpOnly, true);
  assert.equal(options.secure, true);
  assert.equal(options.sameSite, 'strict');
});
