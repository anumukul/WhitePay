import { readFile, writeFile } from 'node:fs/promises';
import {
  createPublicClient,
  http,
  serializeTransaction,
  parseAbi,
  formatEther,
  keccak256,
} from 'viem';
import { WHITECHAIN_SEPOLIA as network } from '../../packages/shared/dist/index.js';

// A cost example, not an authorization or a user-wallet preflight. RPC reads only.
const output = 'docs/evidence/poc-deployment-estimate-example.json';
const client = createPublicClient({
  transport: http(network.rpcUrl, { timeout: 20_000, retryCount: 0 }),
});
if ((await client.getChainId()) !== network.id)
  throw new Error('Expected chain 1874');
const block = await client.getBlock();
const artifact = JSON.parse(
  await readFile(
    'packages/contracts/out/WhitePayAuthorizationPoC.sol/WhitePayAuthorizationPoC.json',
    'utf8',
  ),
);
const sender = '0x1000000000000000000000000000000000000001';
const gasPrice = await client.getGasPrice();
const gas = await client.estimateGas({
  account: sender,
  data: artifact.bytecode.object,
  value: 0n,
  blockNumber: block.number,
});
const unsigned = serializeTransaction({
  type: 'eip1559',
  chainId: network.id,
  nonce: 0,
  gas,
  maxFeePerGas: gasPrice,
  maxPriorityFeePerGas: 1_000_000n,
  value: 0n,
  data: artifact.bytecode.object,
});
const l1Fee = await client.readContract({
  address: '0x420000000000000000000000000000000000000F',
  abi: parseAbi(['function getL1Fee(bytes) view returns(uint256)']),
  functionName: 'getL1Fee',
  args: [unsigned],
  blockNumber: block.number,
});
const recheck = await client.getBlock({ blockNumber: block.number });
if (recheck.hash !== block.hash) throw new Error('Snapshot reorged; rerun');
const result = {
  status: 'READ_ONLY_COST_EXAMPLE_NOT_A_DEPLOYMENT_APPROVAL',
  recordedAt: new Date().toISOString(),
  chainId: network.id,
  block: { number: block.number, hash: block.hash },
  exampleSender: sender,
  constructorArguments: [],
  compiler: '0.8.24',
  evmVersion: 'paris',
  optimizerRuns: 200,
  initCodeHash: keccak256(artifact.bytecode.object),
  estimatedGas: gas,
  observedGasPriceWei: gasPrice,
  estimatedL2FeeWbt: formatEther(gas * gasPrice),
  estimatedL1DataFeeWbt: formatEther(l1Fee),
  estimatedTotalWbt: formatEther(gas * gasPrice + l1Fee),
  deploymentGasCeiling: '2000000',
  paymentGasCeiling: '500000',
  maxFeePerGasWei: '20000000000',
  deploymentL2CeilingWbt: '0.04',
  paymentL2CeilingWbt: '0.01',
  paymentL2BudgetAtObservedGasPriceWbt: formatEther(500_000n * gasPrice),
  limitations: [
    'Example sender is an unfunded public fixture, not a user wallet. No transaction signed or sent.',
    'Re-estimate with actual deployer and nonce immediately before approval.',
    'L1 data fee changes and is not capped by the L2 gas limit.',
    'Payment gas estimate remains pending an actual deployed receiver and valid payer signatures; the 500,000-gas figure is a budget, not measured payment usage.',
  ],
};
await writeFile(
  output,
  `${JSON.stringify(result, (_, value) => (typeof value === 'bigint' ? value.toString() : value), 2)}\n`,
);
console.log(
  JSON.stringify(
    result,
    (_, value) => (typeof value === 'bigint' ? value.toString() : value),
    2,
  ),
);
