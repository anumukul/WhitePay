import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRedirectUrl, WhitePayCheckout } from '../src/index.js';

test('buildRedirectUrl: valid sessionId returns expected path', () => {
  assert.equal(buildRedirectUrl('cs_abc123DEF'), '/checkout/cs_abc123DEF');
});

test('buildRedirectUrl: rejects wrong prefix', () => {
  assert.throws(() => buildRedirectUrl('bad_id'), /Invalid sessionId format/);
});

test('buildRedirectUrl: rejects empty id', () => {
  assert.throws(() => buildRedirectUrl(''), /Invalid sessionId format/);
});

test('buildRedirectUrl: rejects path traversal', () => {
  assert.throws(
    () => buildRedirectUrl('cs_abc/../../evil'),
    /Invalid sessionId format/,
  );
});

test('WhitePayCheckout is a function component', () => {
  assert.equal(typeof WhitePayCheckout, 'function');
});
