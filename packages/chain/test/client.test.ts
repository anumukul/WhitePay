import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import {
  createWalletClient,
  createPublicClient,
  defineChain,
  encodeFunctionData,
  http,
  parseEther,
  type Address,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { WhitePayChainClient } from '../src/client.js';
import {
  spawnAnvil,
  readForgeArtifact,
  repoRoot,
  type AnvilHandle,
} from './anvil-helper.js';
import { whitepayCheckoutAbi } from '../src/abi.js';

let anvil: AnvilHandle;
let checkoutAddress: `0x${string}`;
let emitterAddress: `0x${string}`;
let client: WhitePayChainClient;
let readerClient: WhitePayChainClient;
interface AbiParameterShape {
  type: string;
  name?: string;
  components?: readonly AbiParameterShape[];
  indexed?: boolean;
}
interface AbiEntryShape {
  type: string;
  name?: string;
  stateMutability?: string;
  inputs?: readonly AbiParameterShape[];
  outputs?: readonly AbiParameterShape[];
}
let compiledCheckoutAbi: readonly AbiEntryShape[];
const MOCK_TOKEN =
  '0xcedfb56113143d55b2358b8cfbb0deb5ad2f55a7' as `0x${string}`;

before(async () => {
  anvil = await spawnAnvil({ chainId: 1874 });

  const checkout = await readForgeArtifact(
    join(
      repoRoot(),
      'packages/contracts/out-step03/WhitePayCheckout.sol/WhitePayCheckout.json',
    ),
  );
  compiledCheckoutAbi = checkout.abi as readonly AbiEntryShape[];
  const emitter = await readForgeArtifact(
    join(repoRoot(), 'packages/contracts/out-step03/Emitter.sol/Emitter.json'),
  );

  const chain = defineChain({
    id: 1874,
    name: 'anvil-whitepay',
    nativeCurrency: { name: 'WBT', symbol: 'WBT', decimals: 18 },
    rpcUrls: { default: { http: [anvil.rpcUrl] } },
  });
  const deployer = createWalletClient({
    account: privateKeyToAccount(anvil.deployerPrivateKey),
    chain,
    transport: http(anvil.rpcUrl),
  });
  const pub = createPublicClient({ chain, transport: http(anvil.rpcUrl) });

  const checkoutHash = await deployer.deployContract({
    abi: whitepayCheckoutAbi,
    bytecode: checkout.bytecode,
    args: [1874n, [MOCK_TOKEN]],
  });
  const checkoutReceipt = await pub.waitForTransactionReceipt({
    hash: checkoutHash,
  });
  checkoutAddress = checkoutReceipt.contractAddress!;

  const emitterHash = await deployer.deployContract({
    abi: emitter.abi as any,
    bytecode: emitter.bytecode,
    args: [],
  });
  const emitterReceipt = await pub.waitForTransactionReceipt({
    hash: emitterHash,
  });
  emitterAddress = emitterReceipt.contractAddress!;

  client = new WhitePayChainClient({
    rpcUrl: anvil.rpcUrl,
    expectedChainId: 1874,
    checkoutAddress,
    relayerPrivateKey: anvil.relayerPrivateKey,
    confirmations: 1,
  });

  // A reader-only client pointed at Emitter (so getLogs returns PaymentSettled events from fires).
  readerClient = new WhitePayChainClient({
    rpcUrl: anvil.rpcUrl,
    expectedChainId: 1874,
    checkoutAddress: emitterAddress,
    confirmations: 1,
  });
});

after(async () => {
  await anvil?.stop();
});

test('getChainId matches anvil chain-id flag', async () => {
  const id = await client.getChainId();
  assert.equal(id, 1874);
});

test('getBlockNumber returns a non-negative integer', async () => {
  const n = await client.getBlockNumber();
  assert.ok(Number.isInteger(n));
  assert.ok(n >= 0);
});

test('getBalance of deployer matches expected anvil pre-fund', async () => {
  const balance = await client.getBalance(anvil.deployerAddress);
  // Default anvil pre-funds each account with 10,000 ETH.
  assert.ok(
    balance > parseEther('9999'),
    `balance ${balance} should be ~10000e18`,
  );
});

test('getRelayerBalance works and is positive', async () => {
  const bal = await client.getRelayerBalance();
  assert.ok(bal > 0n);
});

test('settled ABI scopes an orderId to its payer', () => {
  const fn = whitepayCheckoutAbi.find(
    (entry) => entry.type === 'function' && entry.name === 'settled',
  );
  assert.deepEqual(
    fn?.inputs.map((input) => input.type),
    ['address', 'bytes32'],
  );
});

test('chain ABI matches compiled contract function and event shapes', () => {
  const parameter = (p: AbiParameterShape, keepName = false): object => ({
    type: p.type,
    ...(keepName ? { name: p.name } : {}),
    ...(p.components
      ? { components: p.components.map((part) => parameter(part, true)) }
      : {}),
    ...(typeof p.indexed === 'boolean' ? { indexed: p.indexed } : {}),
  });
  const shape = (entry: AbiEntryShape) => ({
    type: entry.type,
    ...(entry.name ? { name: entry.name } : {}),
    ...(entry.stateMutability
      ? { stateMutability: entry.stateMutability }
      : {}),
    inputs: (entry.inputs ?? []).map((p) =>
      parameter(p, entry.type === 'event'),
    ),
    ...(entry.outputs
      ? { outputs: entry.outputs.map((p) => parameter(p)) }
      : {}),
  });
  for (const entry of whitepayCheckoutAbi) {
    const compiled = compiledCheckoutAbi.find(
      (candidate) =>
        candidate.type === entry.type &&
        candidate.name === ('name' in entry ? entry.name : undefined),
    );
    assert.ok(compiled, `Missing compiled ABI entry ${entry.type}`);
    assert.deepEqual(shape(entry), shape(compiled));
  }
});

test('isSettled requires a payer and returns false for a fresh orderId', async () => {
  const fake = ('0x' + '11'.repeat(32)) as `0x${string}`;
  assert.equal(await client.isSettled(anvil.payerAddress, fake), false);
});

test('orderDigest returns a bytes32 for a canonical order', async () => {
  const order = {
    orderId: '0x' + '22'.repeat(32),
    payer: anvil.payerAddress,
    merchant: '0x' + 'bb'.repeat(20),
    amount: 5_000_000n,
    fee: 5_000n,
    feeRecipient: '0x' + 'ff'.repeat(20),
    token: MOCK_TOKEN,
    validAfter: 1,
    validBefore: 2_000_000_000,
    quoteId: '0x' + '33'.repeat(32),
  };
  const digest = await client.orderDigest(order);
  assert.equal(digest.length, 66);
  assert.ok(digest.startsWith('0x'));
});

test('getLogs returns empty array over a fresh block range', async () => {
  const head = await readerClient.getHead();
  const logs = await readerClient.getLogs(0, head);
  assert.deepEqual(logs, []);
});

test('getLogs parses a PaymentSettled event emitted by the Emitter helper', async () => {
  const chain = defineChain({
    id: 1874,
    name: 'anvil-whitepay',
    nativeCurrency: { name: 'WBT', symbol: 'WBT', decimals: 18 },
    rpcUrls: { default: { http: [anvil.rpcUrl] } },
  });
  const sender = createWalletClient({
    account: privateKeyToAccount(anvil.deployerPrivateKey),
    chain,
    transport: http(anvil.rpcUrl),
  });
  const pub = createPublicClient({ chain, transport: http(anvil.rpcUrl) });
  const fireAbi = [
    {
      type: 'function',
      name: 'fire',
      stateMutability: 'nonpayable',
      inputs: [
        { name: 'orderId', type: 'bytes32' },
        { name: 'payer', type: 'address' },
        { name: 'merchant', type: 'address' },
        { name: 'token', type: 'address' },
        { name: 'amount', type: 'uint256' },
        { name: 'fee', type: 'uint256' },
        { name: 'feeRecipient', type: 'address' },
        { name: 'quoteId', type: 'bytes32' },
      ],
      outputs: [],
    },
  ] as const;
  const txHash = await sender.writeContract({
    address: emitterAddress,
    abi: fireAbi,
    functionName: 'fire',
    args: [
      ('0x' + 'aa'.repeat(32)) as `0x${string}`,
      anvil.payerAddress,
      ('0x' + 'bb'.repeat(20)) as Address,
      MOCK_TOKEN,
      1_000_000n,
      1_000n,
      ('0x' + 'ff'.repeat(20)) as Address,
      ('0x' + 'cc'.repeat(32)) as `0x${string}`,
    ],
    chain,
  });
  const receipt = await pub.waitForTransactionReceipt({ hash: txHash });
  const logs = await readerClient.getLogs(
    Number(receipt.blockNumber),
    Number(receipt.blockNumber),
  );
  assert.equal(logs.length, 1);
  assert.equal(logs[0].orderId.toLowerCase(), '0x' + 'aa'.repeat(32));
  assert.equal(logs[0].amount, 1_000_000n);
  assert.equal(logs[0].fee, 1_000n);
  assert.equal(logs[0].payer.toLowerCase(), anvil.payerAddress.toLowerCase());
  assert.equal(logs[0].token.toLowerCase(), MOCK_TOKEN);
});

test('sendTransaction via wallet client mines (plain ETH transfer from relayer)', async () => {
  // Validates the wallet client wiring without needing a working settle.
  const chain = defineChain({
    id: 1874,
    name: 'anvil-whitepay',
    nativeCurrency: { name: 'WBT', symbol: 'WBT', decimals: 18 },
    rpcUrls: { default: { http: [anvil.rpcUrl] } },
  });
  const wallet = createWalletClient({
    account: privateKeyToAccount(anvil.relayerPrivateKey),
    chain,
    transport: http(anvil.rpcUrl),
  });
  const pub = createPublicClient({ chain, transport: http(anvil.rpcUrl) });
  const hash = await wallet.sendTransaction({
    to: anvil.payerAddress,
    value: parseEther('0.01'),
    chain,
  });
  const receipt = await pub.waitForTransactionReceipt({ hash });
  assert.equal(receipt.status, 'success');
});

test('asChainAdapter conforms to the ChainAdapter interface shape', () => {
  const adapter = client.asChainAdapter();
  assert.equal(typeof adapter.chainId, 'function');
  assert.equal(typeof adapter.nowSeconds, 'function');
  assert.equal(typeof adapter.getRelayerBalance, 'function');
  assert.equal(typeof adapter.estimateSettleGas, 'function');
  assert.equal(typeof adapter.sendSettle, 'function');
  assert.ok(Number.isInteger(adapter.nowSeconds()));
});

test('asChainReader conforms to the ChainReader interface shape', () => {
  const reader = client.asChainReader();
  assert.equal(typeof reader.getHead, 'function');
  assert.equal(typeof reader.getLogs, 'function');
});

test('estimateSettleGas rejects invalid order (not allowed token, no sig)', async () => {
  // With bogus signatures + mismatching state, estimation should throw —
  // confirms the client surfaces revert reasons properly.
  const order = {
    orderId: '0x' + '44'.repeat(32),
    payer: anvil.payerAddress,
    merchant: '0x' + 'bb'.repeat(20),
    amount: 5_000_000n,
    fee: 5_000n,
    feeRecipient: '0x' + 'ff'.repeat(20),
    token: ('0x' + 'de'.repeat(20)) as `0x${string}`, // NOT allowed
    validAfter: 1,
    validBefore: 2_000_000_000,
    quoteId: '0x' + '33'.repeat(32),
  };
  await assert.rejects(() => client.estimateSettleGas(order, '0x00', '0x00'));
});
