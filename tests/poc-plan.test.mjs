import test from 'node:test';
import assert from 'node:assert/strict';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import { hashTypedData, recoverTypedDataAddress } from 'viem';
import {
  validateConfig,
  prepareAuthorizations,
  readiness,
} from '../scripts/poc/plan.mjs';

const addresses = Array.from(
  { length: 6 },
  (_, i) => `0x${String(i + 1).padStart(40, '0')}`,
);
const config = () => ({
  chainId: 1874,
  deployer: addresses[0],
  relayer: addresses[1],
  payer: addresses[2],
  merchant: addresses[3],
  feeRecipient: addresses[4],
  amount: '5000000',
  fee: '5000',
  deploymentGasLimit: '2000000',
  paymentGasLimit: '500000',
  maxFeePerGas: '20000000000',
});

test('proof configuration rejects wrong chain, missing/duplicate roles, and imprecise amounts', () => {
  assert.doesNotThrow(() => validateConfig(config()));
  assert.throws(() => validateConfig({ ...config(), chainId: 1875 }), /1874/);
  assert.throws(() => validateConfig({ ...config(), payer: '' }), /payer/);
  assert.throws(
    () => validateConfig({ ...config(), payer: addresses[1] }),
    /distinct/,
  );
  assert.throws(
    () => validateConfig({ ...config(), amount: 5.005 }),
    /integer string/,
  );
  assert.throws(() => validateConfig({ ...config(), amount: '0' }), /positive/);
  assert.throws(
    () => validateConfig({ ...config(), fee: '-1' }),
    /integer string/,
  );
});
test('proof readiness refuses a payer with WBT, missing tokens, or underfunded sponsors', () => {
  const c = validateConfig(config());
  const budget = {
    deployer: 40_000_000_000_000_000n,
    relayer: 10_000_000_000_000_000n,
  };
  assert.deepEqual(
    readiness(c, {
      payerWbt: 0n,
      payerUsdt: 5_005_000n,
      deployerWbt: budget.deployer,
      relayerWbt: budget.relayer,
    }),
    [],
  );
  assert.equal(
    readiness(c, {
      payerWbt: 1n,
      payerUsdt: 0n,
      deployerWbt: 0n,
      relayerWbt: 0n,
    }).length,
    4,
  );
});
test('order and token signatures bind the same exact total, recipient, and order digest', async () => {
  const signer = privateKeyToAccount(generatePrivateKey());
  const c = validateConfig({ ...config(), payer: signer.address });
  const prepared = prepareAuthorizations(c, addresses[5], {
    orderId: `0x${'ab'.repeat(32)}`,
    quoteId: `0x${'cd'.repeat(32)}`,
    validAfter: 100n,
    validBefore: 1000n,
  });
  assert.equal(prepared.token.message.value, 5_005_000n);
  assert.equal(prepared.token.message.to, addresses[5]);
  assert.equal(prepared.token.message.nonce, hashTypedData(prepared.order));
  assert.equal(
    prepared.order.message.token,
    '0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7',
  );
  const sig = await signer.signTypedData(prepared.order);
  assert.equal(
    (
      await recoverTypedDataAddress({ ...prepared.order, signature: sig })
    ).toLowerCase(),
    signer.address.toLowerCase(),
  );
  for (const key of ['merchant', 'amount', 'fee', 'feeRecipient', 'quoteId']) {
    const value = prepared.order.message[key];
    const altered = {
      ...prepared.order,
      message: {
        ...prepared.order.message,
        [key]:
          typeof value === 'bigint'
            ? value + 1n
            : key === 'quoteId'
              ? `0x${'ef'.repeat(32)}`
              : addresses[0],
      },
    };
    assert.notEqual(hashTypedData(altered), prepared.token.message.nonce, key);
  }
});

test('public proof config rejects unknown fields rather than copying possible secrets to evidence', () => {
  assert.throws(
    () => validateConfig({ ...config(), privateKey: 'must-not-be-copied' }),
    /public fields only/,
  );
});

test('offchain order digest matches the Solidity interoperability vector', async () => {
  const { keccak256, toHex } = await import('viem');
  // Public test fixture only; never use this account for any funded proof.
  const payer = privateKeyToAccount(`0x${'a11ce'.padStart(64, '0')}`).address;
  const c = validateConfig({
    ...config(),
    payer,
    merchant: '0x0000000000000000000000000000000000000B0b',
    feeRecipient: '0x0000000000000000000000000000000000000FEE',
  });
  const prepared = prepareAuthorizations(
    c,
    '0x1000000000000000000000000000000000000006',
    {
      orderId: keccak256(toHex('order-1')),
      quoteId: keccak256(toHex('quote-1')),
      validAfter: 999n,
      validBefore: 2000n,
    },
  );
  assert.equal(
    hashTypedData(prepared.order),
    '0x6f4080181e88418d124d4ec129901c4e8644582ccbdf67ac25b1d02d560d67b6',
  );
});
