import { readFile, writeFile, mkdir } from 'node:fs/promises';
import {
  createPublicClient,
  http,
  parseAbi,
  getContractAddress,
  keccak256,
  formatEther,
  formatUnits,
} from 'viem';
import { WHITECHAIN_SEPOLIA as network } from '../../packages/shared/dist/index.js';
import { ROLES, validateConfig, readiness } from './plan.mjs';
import { tokenDomainSeparator } from '../lib/token-probe.mjs';

// Read-only. No signer, private key, wallet client, or broadcast method is loaded.
const [configPath, output] = process.argv.slice(2);
if (
  !configPath ||
  !output ||
  !/^docs\/evidence\/[a-zA-Z0-9_/-]+\.json$/.test(output) ||
  output.includes('..')
)
  throw new Error(
    'Usage: pnpm poc:preflight <public-config.json> docs/evidence/poc-preflight.json',
  );
const report = {
  status: 'BLOCKED',
  recordedAt: new Date().toISOString(),
  operations: 'READ_ONLY',
  blockers: [],
};
try {
  const config = validateConfig(JSON.parse(await readFile(configPath, 'utf8')));
  const rpcMethods = new Set([
    'eth_chainId',
    'eth_getBlockByNumber',
    'eth_getBalance',
    'eth_getCode',
    'eth_getStorageAt',
    'eth_getTransactionCount',
    'eth_call',
    'eth_estimateGas',
    'eth_gasPrice',
  ]);
  const base = http(network.rpcUrl, { timeout: 20_000, retryCount: 0 });
  const client = createPublicClient({
    transport: (options) => {
      const transport = base(options);
      return {
        ...transport,
        request: (args, opts) => {
          if (!rpcMethods.has(args.method))
            throw new Error(`Read-only preflight refuses ${args.method}`);
          return transport.request(args, opts);
        },
      };
    },
  });
  const chainId = await client.getChainId();
  if (chainId !== network.id)
    throw new Error('RPC chain mismatch: expected 1874');
  const block = await client.getBlock();
  report.chainId = chainId;
  report.block = {
    number: block.number,
    hash: block.hash,
    timestamp: block.timestamp,
  };
  report.config = config;
  const abi = parseAbi([
    'function balanceOf(address) view returns (uint256)',
    'function decimals() view returns (uint8)',
    'function DOMAIN_SEPARATOR() view returns (bytes32)',
    'function isBlocked(address) view returns (bool)',
  ]);
  const atBlock = { address: network.usdt, abi, blockNumber: block.number };
  const tokenCode = await client.getCode({
    address: network.usdt,
    blockNumber: block.number,
  });
  if (!tokenCode || tokenCode === '0x')
    throw new Error('Official token has no bytecode');
  const storage = await client.getStorageAt({
    address: network.usdt,
    slot: '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc',
    blockNumber: block.number,
  });
  const implementation = `0x${storage.slice(-40)}`;
  const implementationCode = await client.getCode({
    address: implementation,
    blockNumber: block.number,
  });
  const previous = JSON.parse(
    await readFile('docs/evidence/token-probe.json', 'utf8'),
  );
  report.token = {
    address: network.usdt,
    implementation,
    codeHash: keccak256(tokenCode),
    implementationCodeHash: keccak256(implementationCode),
    decimals: await client.readContract({
      ...atBlock,
      functionName: 'decimals',
    }),
  };
  if (
    implementation.toLowerCase() !==
      previous.proxy.implementation.toLowerCase() ||
    report.token.implementationCodeHash !==
      previous.implementationCode.keccak256 ||
    report.token.codeHash !== previous.tokenCode.keccak256
  )
    report.blockers.push(
      'Token code or implementation changed since Step 01; reinvestigate',
    );
  if (report.token.decimals !== 6)
    report.blockers.push(
      'Token decimals changed since Step 01; reinvestigate amounts',
    );
  const domain = await client.readContract({
    ...atBlock,
    functionName: 'DOMAIN_SEPARATOR',
  });
  if (
    domain !==
    tokenDomainSeparator({
      name: 'Tether USD',
      version: '1',
      chainId,
      verifyingContract: network.usdt,
    })
  )
    report.blockers.push('Unexpected token signing domain');
  report.accounts = Object.fromEntries(
    await Promise.all(
      ROLES.map(async (role) => [
        role,
        {
          address: config[role],
          wbt: await client.getBalance({
            address: config[role],
            blockNumber: block.number,
          }),
          usdt: await client.readContract({
            ...atBlock,
            functionName: 'balanceOf',
            args: [config[role]],
          }),
          blocked: await client.readContract({
            ...atBlock,
            functionName: 'isBlocked',
            args: [config[role]],
          }),
          hasCode: ![undefined, '0x'].includes(
            await client.getCode({
              address: config[role],
              blockNumber: block.number,
            }),
          ),
        },
      ]),
    ),
  );
  report.payerChecks = {
    zeroWbt: report.accounts.payer.wbt === 0n,
    sufficientOfficialUsdt:
      report.accounts.payer.usdt >= config.amount + config.fee,
    requiredUsdtMinor: config.amount + config.fee,
    actualUsdtMinor: report.accounts.payer.usdt,
  };
  for (const role of ROLES) {
    if (report.accounts[role].blocked)
      report.blockers.push(`${role} is token-blocklisted`);
    if (report.accounts[role].hasCode)
      report.blockers.push(
        `${role} must be a fresh EOA for this restricted proof`,
      );
  }
  report.blockers.push(
    ...readiness(config, {
      payerWbt: report.accounts.payer.wbt,
      payerUsdt: report.accounts.payer.usdt,
      deployerWbt: report.accounts.deployer.wbt,
      relayerWbt: report.accounts.relayer.wbt,
    }),
  );
  const nonce = await client.getTransactionCount({
    address: config.deployer,
    blockNumber: block.number,
  });
  const predicted = getContractAddress({
    from: config.deployer,
    nonce: BigInt(nonce),
  });
  const artifact = JSON.parse(
    await readFile(
      'packages/contracts/out/WhitePayAuthorizationPoC.sol/WhitePayAuthorizationPoC.json',
      'utf8',
    ),
  );
  const gasPrice = await client.getGasPrice();
  report.deploymentPreview = {
    from: config.deployer,
    nonce,
    predictedAddress: predicted,
    constructorArguments: [],
    chainId,
    value: '0',
    initCodeHash: keccak256(artifact.bytecode.object),
    initCodeBytes: (artifact.bytecode.object.length - 2) / 2,
    compiler: '0.8.24',
    evmVersion: 'paris',
    optimizerRuns: 200,
    maxFeePerGas: config.maxFeePerGas,
    gasLimit: config.deploymentGasLimit,
    configuredL2Budget: config.deploymentGasLimit * config.maxFeePerGas,
    observedGasPrice: gasPrice,
  };
  report.paymentPreview = {
    from: config.relayer,
    payer: config.payer,
    receiver: predicted,
    merchant: config.merchant,
    feeRecipient: config.feeRecipient,
    amount: config.amount,
    fee: config.fee,
    total: config.amount + config.fee,
    token: network.usdt,
    payerTransactions: 0,
    gasLimit: config.paymentGasLimit,
    maxFeePerGas: config.maxFeePerGas,
    configuredL2Budget: config.paymentGasLimit * config.maxFeePerGas,
  };
  if (gasPrice > config.maxFeePerGas)
    report.blockers.push('Observed gas price exceeds approved fee cap');
  if (report.blockers.length === 0) {
    report.deploymentPreview.estimatedGas = await client.estimateGas({
      account: config.deployer,
      data: artifact.bytecode.object,
      value: 0n,
    });
    if (report.deploymentPreview.estimatedGas > config.deploymentGasLimit)
      report.blockers.push(
        'Deployment estimate exceeds configured gas ceiling',
      );
  }
  const endBlock = await client.getBlock({ blockNumber: block.number });
  if (endBlock.hash !== block.hash)
    report.blockers.push('Snapshot reorged; rerun');
  report.status = report.blockers.length
    ? 'BLOCKED'
    : 'READY_FOR_DEPLOYMENT_REVIEW';
  report.approval =
    'NOT AUTHORIZED: review source, second-teammate security review, exact signers, and gas budget before any deployment. Payment requires another preview after deployment and both payer signatures.';
  report.limitations = [
    'Configured budgets cover L2 gas only; reserve for L1 data fee and confirm funding before approved writes.',
    'This tool does not deploy, fund accounts, create keys, sign, or submit payments.',
    'Predicted address depends on unchanged deployer nonce; rerun immediately before deployment.',
  ];
  if (report.blockers.length) process.exitCode = 1;
} catch (error) {
  report.blockers.push(error.shortMessage ?? error.message);
  process.exitCode = 1;
} finally {
  await mkdir('docs/evidence', { recursive: true });
  await writeFile(
    output,
    `${JSON.stringify(report, (_, value) => (typeof value === 'bigint' ? value.toString() : value), 2)}\n`,
  );
  if (report.accounts) {
    console.log(
      `Whitechain Sepolia balances — chain ${report.chainId}, block ${report.block.number}`,
    );
    console.table(
      ROLES.map((role) => ({
        role,
        address: report.accounts[role].address,
        WBT: formatEther(report.accounts[role].wbt),
        officialUSDT: formatUnits(
          report.accounts[role].usdt,
          report.token.decimals,
        ),
      })),
    );
  }
  console.log(
    JSON.stringify(
      {
        status: report.status,
        payerChecks: report.payerChecks,
        blockers: report.blockers,
        deploymentPreview: report.deploymentPreview,
        paymentPreview: report.paymentPreview,
        output,
      },
      (_, value) => (typeof value === 'bigint' ? value.toString() : value),
      2,
    ),
  );
}
