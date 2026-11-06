import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { createApprovedWallet } from '../scripts/approved-wallet.js';
function fixture() {
  const payer = privateKeyToAccount(generatePrivateKey());
  let now = 1,
    calls = 0;
  const td = (value: number) => ({
    domain: { name: 'Test', version: '1', chainId: 1874 },
    types: { Test: [{ name: 'value', type: 'uint256' }] },
    primaryType: 'Test',
    message: { value },
  });
  const order = td(1),
    token = td(2);
  const wallet = createApprovedWallet({
    payer: payer.address,
    order,
    token,
    validBefore: 900,
    now: async () => now,
    balance: async () => 2000000n,
    signDigest: async (hash) => {
      calls++;
      return payer.sign({ hash });
    },
  });
  const request = (data: any) =>
    wallet.request({
      method: 'eth_signTypedData_v4',
      params: [payer.address, JSON.stringify(data)],
    });
  return {
    wallet,
    payer,
    order,
    token,
    request,
    calls: () => calls,
    expire: () => {
      now = 780;
    },
  };
}
test('local encrypted-wallet adapter refuses transactions and unapproved signing hashes', async () => {
  const f = fixture();
  await assert.rejects(
    () => f.wallet.request({ method: 'eth_sendTransaction', params: [] }),
    /denied/,
  );
  await assert.rejects(
    () => f.request({ ...f.order, message: { value: 3 } }),
    /denied/,
  );
  await assert.rejects(() => f.request(f.token), /denied/);
  assert.equal(f.calls(), 0);
});
test('approved typed-data hashes sign in order and retries reuse the same authorization', async () => {
  const f = fixture(),
    a = await f.request(f.order);
  assert.equal(await f.request(f.order), a);
  await f.request(f.token);
  assert.equal(f.calls(), 2);
});
test('cutoff closes local wallet signing including cached authorization responses', async () => {
  const f = fixture();
  await f.request(f.order);
  f.expire();
  await assert.rejects(() => f.request(f.token), /expired/);
  await assert.rejects(() => f.request(f.order), /expired/);
  assert.equal(f.calls(), 1);
});

test('concurrent local wallet requests cannot open two keystore prompts', async () => {
  const f = fixture();
  const result = await Promise.allSettled([
    f.request(f.order),
    f.request(f.order),
  ]);
  assert.equal(f.calls(), 1);
  assert.equal(result.filter((r) => r.status === 'rejected').length, 1);
});
