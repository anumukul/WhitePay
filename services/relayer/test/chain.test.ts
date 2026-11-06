import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createPublicClient,
  custom,
  keccak256,
  toHex,
  decodeErrorResult,
} from 'viem';
import { whitepayCheckoutAbi } from '@whitepay/chain';
import type { WhitePayChainClient } from '@whitepay/chain';
import { createRelayerAdapter } from '../src/chain.js';
const address = '0xcccccccccccccccccccccccccccccccccccccccc';
function make(expected = keccak256('0x6000')) {
  const calls: string[] = [];
  const publicClient = createPublicClient({
    transport: custom({
      async request({ method }) {
        calls.push(method);
        if (method === 'eth_getCode') return '0x6000';
        if (method === 'eth_estimateGas') return '0x249f0';
        if (method === 'eth_chainId') return '0x752';
        if (method === 'eth_call') return toHex(100n, { size: 32 });
        if (method === 'eth_getTransactionReceipt') return null;
        throw new Error('Unexpected method');
      },
    }),
  });
  const client = {
    publicClient,
    configCheckoutAddress: () => address,
    getChainId: () => publicClient.getChainId(),
    confirmations: 2,
  } as unknown as WhitePayChainClient;
  return { calls, adapter: createRelayerAdapter(client, address, expected) };
}
test('RPC adapter checks exact runtime before gas simulation', async () => {
  const { adapter, calls } = make();
  assert.equal(await adapter.simulate('0x1234'), 150000n);
  assert.deepEqual(calls, ['eth_getCode', 'eth_estimateGas']);
});
test('RPC adapter rejects wrong runtime without attempting simulation', async () => {
  const { adapter, calls } = make(keccak256('0x6001'));
  await assert.rejects(() => adapter.simulate('0x1234'), /runtime/);
  assert.deepEqual(calls, ['eth_getCode']);
});
test('RPC adapter has no default signer', async () => {
  const { adapter } = make();
  await assert.rejects(
    () => adapter.sign({} as any),
    /operator_signer_required/,
  );
});
test('RPC adapter treats missing receipt as pending', async () => {
  const { adapter } = make();
  assert.equal(
    await adapter.receipt(('0x' + 'a'.repeat(64)) as `0x${string}`),
    null,
  );
});

test('cutoff clock cannot lag wall time when RPC returns a stale block', async () => {
  const client = {
    publicClient: { getBlock: async () => ({ timestamp: 1n }) },
  } as unknown as WhitePayChainClient;
  const adapter = createRelayerAdapter(client, address, keccak256('0x6000'));
  const before = Math.floor(Date.now() / 1000);
  assert.ok((await adapter.nowSeconds()) >= before);
});

test('public checkout ABI decodes the deployed replay error selector', () => {
  assert.equal(
    decodeErrorResult({ abi: whitepayCheckoutAbi, data: '0x4747436c' })
      .errorName,
    'OrderAlreadySettled',
  );
});
