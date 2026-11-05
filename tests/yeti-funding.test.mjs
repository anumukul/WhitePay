import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  decodeFunctionData,
  decodeAbiParameters,
  encodeFunctionData,
  encodeAbiParameters,
  parseAbi,
} from 'viem';
import { verifyYetiNativeQuote } from '../scripts/poc/yeti-quote.mjs';
const fixture = JSON.parse(
  readFileSync(new URL('./fixtures/yeti-native-quote.json', import.meta.url)),
);
const taker = '0x1000000000000000000000000000000000000001';
const options = { taker, nowMs: Date.parse(fixture.data.expiresAt) - 1000 };
const executeAbi = parseAbi([
  'function execute(bytes commands,bytes[] inputs,uint256 deadline) payable',
]);

test('native quote validates exact output token, actual calldata minimum and no ERC20 approval', () => {
  const result = verifyYetiNativeQuote(fixture, options);
  assert.equal(result.amountIn, 150000000000000000n);
  assert.equal(result.amountOut, 11028196n);
  assert.ok(result.minimumReceived >= 10000000n);
  assert.equal(result.approvalRequired, false);
  assert.equal(result.commands, '0x0b00');
});
test('funding quote rejects wrong chain/token/router, overspending, and expired quotes', () => {
  for (const alter of [
    (q) => {
      q.data.chainId = 1875;
    },
    (q) => {
      q.data.tokenOut.address = taker;
    },
    (q) => {
      q.data.transaction.to = taker;
    },
    (q) => {
      q.data.transaction.value = '151000000000000000';
    },
    (q) => {
      q.data.slippageBps = 100;
    },
  ]) {
    const q = structuredClone(fixture);
    alter(q);
    assert.throws(() => verifyYetiNativeQuote(q, options));
  }
  assert.throws(
    () =>
      verifyYetiNativeQuote(fixture, {
        ...options,
        nowMs: Date.parse(fixture.data.expiresAt) + 1,
      }),
    /expired/i,
  );
});
test('decoded swap minimum, recipient, commands, and approval source cannot be tampered', () => {
  const types = [
    { type: 'address' },
    { type: 'uint256' },
    { type: 'uint256' },
    { type: 'bytes' },
    { type: 'bool' },
    { type: 'uint256[]' },
  ];
  for (const change of ['minimum', 'recipient', 'payer', 'allowFailure']) {
    const q = structuredClone(fixture);
    const decoded = decodeFunctionData({
      abi: executeAbi,
      data: q.data.transaction.data,
    });
    let [commands, inputs, deadline] = decoded.args;
    inputs = [...inputs];
    const values = [...decodeAbiParameters(types, inputs[1])];
    if (change === 'minimum') values[2] = 1n;
    if (change === 'recipient')
      values[0] = '0x1000000000000000000000000000000000000002';
    if (change === 'payer') values[4] = true;
    if (change === 'allowFailure') commands = '0x0b80';
    inputs[1] = encodeAbiParameters(types, values);
    q.data.transaction.data = encodeFunctionData({
      abi: executeAbi,
      functionName: 'execute',
      args: [commands, inputs, deadline],
    });
    assert.throws(() => verifyYetiNativeQuote(q, options), change);
  }
});
