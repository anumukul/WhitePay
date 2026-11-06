import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { closeDb } from '@whitepay/api/src/db.js';
import { validate } from '../src/validate.js';
import { fixture } from './fixtures.js';
after(async () => {
  await closeDb();
});
for (const [name, change, reason] of [
  [
    'frontend amount',
    (r: any) => {
      r.order_payload.amount = '1';
    },
    'amount_mismatch',
  ],
  [
    'merchant payout',
    (r: any) => {
      r.order_payload.merchant = '0x' + 'd'.repeat(40);
    },
    'merchant_mismatch',
  ],
  [
    'token',
    (r: any) => {
      r.order_payload.token = '0x' + 'd'.repeat(40);
    },
    'token_mismatch',
  ],
  [
    'fee',
    (r: any) => {
      r.order_payload.fee = '1001';
    },
    'fee_mismatch',
  ],
  [
    'fee recipient',
    (r: any) => {
      r.order_payload.feeRecipient = '0x' + 'e'.repeat(40);
    },
    'fee_mismatch',
  ],
  [
    'expiry',
    (r: any) => {
      r.order_payload.validBefore = 0;
    },
    'time_expired',
  ],
  [
    'quote domain',
    (r: any) => {
      r.order_typed_data.domain.chainId = 1;
    },
    'domain_mismatch',
  ],
  [
    'token authorization',
    (r: any) => {
      r.token_typed_data.message.to = '0x' + 'e'.repeat(40);
    },
    'authorization_mismatch',
  ],
  [
    'payer signature',
    (r: any) => {
      r.order_signature = '0x' + 'ab'.repeat(65);
    },
    'invalid_signature',
  ],
  [
    'token signature',
    (r: any) => {
      r.token_signature = '0x' + 'cd'.repeat(65);
    },
    'invalid_signature',
  ],
] as const)
  test(`independently rejects ${name} tampering`, async () => {
    const f = await fixture();
    change(f.row);
    await assert.rejects(
      () => validate(f.row, f.cfg, f.state.now),
      new RegExp(reason),
    );
  });
test('validates real ephemeral payer signatures against authoritative session', async () => {
  const f = await fixture();
  assert.ok((await validate(f.row, f.cfg, f.state.now)).startsWith('0x'));
});
