import { mkdir, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import {
  decodeFunctionResult,
  encodeFunctionData,
  keccak256,
  parseAbi,
  parseSignature,
  toFunctionSelector,
  toHex,
  zeroAddress,
} from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { WHITECHAIN_SEPOLIA as network } from '../packages/shared/dist/index.js';
import {
  assertTarget,
  classifyCall,
  capabilityConclusion,
  rpcRead,
  tokenDomainSeparator,
} from './lib/token-probe.mjs';

const output = process.argv[2];
if (
  !output ||
  !/^docs\/evidence\/[a-zA-Z0-9_/-]+\.json$/.test(output) ||
  output.includes('..')
) {
  throw new Error('Usage: pnpm probe:token docs/evidence/token-probe.json');
}
const token = network.usdt;
const result = {
  fetchedAt: new Date().toISOString(),
  network,
  operations: 'READ_ONLY_ETH_CALL',
  checks: [],
};
const check = (name, condition) => {
  result.checks.push({ name, passed: Boolean(condition) });
  if (!condition) throw new Error(`Probe check failed: ${name}`);
};
const required = async (method, params) => {
  const response = await rpcRead(method, params);
  if (response.error) throw new Error(`${method}: ${response.error.message}`);
  return response.result;
};
const fetchJson = async (url) => {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Explorer HTTP ${response.status}`);
  return response.json();
};
const reportSource = (data) => ({
  name: data.name ?? null,
  isVerified: data.is_verified ?? false,
  isFullyVerified: data.is_fully_verified ?? false,
  compilerVersion: data.compiler_version ?? null,
  proxyType: data.proxy_type ?? null,
  implementations: data.implementations,
  abi: data.abi ?? [],
  sourceHashes: [
    ...(data.source_code
      ? [{ file_path: data.file_path, source_code: data.source_code }]
      : []),
    ...(data.additional_sources ?? []),
  ].map((file) => ({
    file: file.file_path,
    keccak256: keccak256(toHex(file.source_code)),
  })),
});

try {
  result.chainIdHex = await required('eth_chainId', []);
  // Reject a wrong network before inspecting any token state.
  assertTarget(result.chainIdHex, '0x01');
  const block = await required('eth_getBlockByNumber', ['latest', false]);
  result.block = {
    number: block.number,
    hash: block.hash,
    timestamp: block.timestamp,
  };
  const tag = block.number;
  const code = await required('eth_getCode', [token, tag]);
  assertTarget(result.chainIdHex, code);
  result.tokenCode = {
    bytes: (code.length - 2) / 2,
    keccak256: keccak256(code),
  };
  const slot =
    '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';
  const storage = await required('eth_getStorageAt', [token, slot, tag]);
  const implementation = `0x${storage.slice(-40)}`;
  result.proxy = { standard: 'EIP-1967', slot, storage, implementation };
  check('nonzero implementation', implementation !== zeroAddress);
  const implementationCode = await required('eth_getCode', [
    implementation,
    tag,
  ]);
  assertTarget(result.chainIdHex, implementationCode);
  result.implementationCode = {
    bytes: (implementationCode.length - 2) / 2,
    keccak256: keccak256(implementationCode),
  };
  const explorerBase = `${network.explorerUrl}/api/v2/smart-contracts`;
  const [proxyInfo, implementationInfo] = await Promise.all([
    fetchJson(`${explorerBase}/${token}`),
    fetchJson(`${explorerBase}/${implementation}`),
  ]);
  result.explorer = {
    proxyUrl: `${explorerBase}/${token}`,
    implementationUrl: `${explorerBase}/${implementation}`,
    proxy: reportSource(proxyInfo),
    implementation: reportSource(implementationInfo),
  };
  check(
    'explorer implementation matches RPC storage',
    proxyInfo.implementations?.some(
      (item) =>
        item.address_hash.toLowerCase() === implementation.toLowerCase(),
    ),
  );
  check(
    'implementation source fully verified',
    implementationInfo.is_verified && implementationInfo.is_fully_verified,
  );
  check(
    'verified runtime matches RPC implementation bytecode',
    implementationInfo.deployed_bytecode?.toLowerCase() ===
      implementationCode.toLowerCase(),
  );
  const abi = implementationInfo.abi;
  const reads = parseAbi([
    'function name() view returns (string)',
    'function symbol() view returns (string)',
    'function decimals() view returns (uint8)',
    'function DOMAIN_SEPARATOR() view returns (bytes32)',
    'function nonces(address) view returns (uint256)',
    'function balanceOf(address) view returns (uint256)',
    'function allowance(address,address) view returns (uint256)',
    'function authorizationState(address,bytes32) view returns (bool)',
    'function TRANSFER_WITH_AUTHORIZATION_TYPEHASH() view returns (bytes32)',
    'function RECEIVE_WITH_AUTHORIZATION_TYPEHASH() view returns (bytes32)',
  ]);
  const call = async (
    functionName,
    args = [],
    from = zeroAddress,
    callAbi = reads,
  ) => {
    const data = encodeFunctionData({ abi: callAbi, functionName, args });
    return classifyCall(
      await rpcRead('eth_call', [
        { to: token, from, data, gas: '0x989680' },
        tag,
      ]),
    );
  };
  const read = async (functionName, args = []) => {
    const response = await call(functionName, args);
    if (response.status !== 'returned')
      throw new Error(
        `Cannot decode ${functionName}: ${JSON.stringify(response)}`,
      );
    return decodeFunctionResult({
      abi: reads,
      functionName,
      data: response.result,
    });
  };
  result.metadata = {
    name: await read('name'),
    symbol: await read('symbol'),
    decimals: await read('decimals'),
  };
  const domain = {
    name: result.metadata.name,
    version: '1',
    chainId: network.id,
    verifyingContract: token,
  };
  result.domain = {
    ...domain,
    expected: tokenDomainSeparator(domain),
    onchain: await read('DOMAIN_SEPARATOR'),
  };
  check(
    'EIP-712 domain name/version/chain/proxy match',
    result.domain.expected === result.domain.onchain,
  );
  // Fresh disposable keys exist only in memory and are never printed or saved.
  const signer = privateKeyToAccount(generatePrivateKey());
  const recipient = privateKeyToAccount(generatePrivateKey()).address;
  const nonce = `0x${randomBytes(32).toString('hex')}`;
  const deadline = BigInt(block.timestamp) + 3600n;
  result.probeAccount = {
    address: signer.address,
    recipient,
    nativeBalance: await required('eth_getBalance', [signer.address, tag]),
    tokenBalance: await read('balanceOf', [signer.address]),
    permitNonce: await read('nonces', [signer.address]),
    authorizationNonce: nonce,
  };
  check(
    'disposable signer has zero WBT and zero USDT',
    BigInt(result.probeAccount.nativeBalance) === 0n &&
      result.probeAccount.tokenBalance === 0n,
  );
  const permitType = [
    { name: 'owner', type: 'address' },
    { name: 'spender', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ];
  const authorizationType = [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' },
  ];
  const permitMessage = {
    owner: signer.address,
    spender: recipient,
    value: 1n,
    nonce: result.probeAccount.permitNonce,
    deadline,
  };
  const authMessage = {
    from: signer.address,
    to: recipient,
    value: 0n,
    validAfter: 0n,
    validBefore: deadline,
    nonce,
  };
  result.calls = [];
  const execute = async (
    label,
    signatureText,
    args,
    caller,
    expectedReason = null,
  ) => {
    const parsedAbi = parseAbi([`function ${signatureText}`]);
    const functionName = signatureText.slice(0, signatureText.indexOf('('));
    const selector = toFunctionSelector(signatureText);
    const abiPresent = abi.some(
      (entry) =>
        entry.type === 'function' && toFunctionSelector(entry) === selector,
    );
    const selectorPresent = implementationCode
      .toLowerCase()
      .includes(selector.slice(2));
    const response = await call(functionName, args, caller, parsedAbi);
    const passed = expectedReason
      ? response.status === 'error' &&
        JSON.stringify(response.error).includes(expectedReason)
      : response.status === 'empty';
    result.calls.push({
      label,
      function: signatureText,
      selector,
      abiPresent,
      selectorPresent,
      expected: expectedReason ?? 'successful eth_call (empty return)',
      passed,
      response,
      conclusion: capabilityConclusion({
        abiPresent,
        selectorPresent,
        validSignatureCall: !expectedReason && passed,
      }),
    });
    check(label, passed && abiPresent && selectorPresent);
  };
  result.authorizationTypehashes = {
    transfer: await read('TRANSFER_WITH_AUTHORIZATION_TYPEHASH'),
    receive: await read('RECEIVE_WITH_AUTHORIZATION_TYPEHASH'),
  };
  for (const [kind, primaryType] of [
    ['transfer', 'TransferWithAuthorization'],
    ['receive', 'ReceiveWithAuthorization'],
  ]) {
    check(
      `${kind} authorization typehash matches`,
      result.authorizationTypehashes[kind] ===
        keccak256(
          toHex(
            `${primaryType}(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)`,
          ),
        ),
    );
  }
  const permitSignature = await signer.signTypedData({
    domain,
    types: { Permit: permitType },
    primaryType: 'Permit',
    message: permitMessage,
  });
  const parts = (signature) => {
    const { v, r, s } = parseSignature(signature);
    return [Number(v), r, s];
  };
  const permitArgs = [signer.address, recipient, 1n, deadline];
  await execute(
    'permit bytes valid',
    'permit(address,address,uint256,uint256,bytes)',
    [...permitArgs, permitSignature],
    zeroAddress,
  );
  await execute(
    'permit vrs valid',
    'permit(address,address,uint256,uint256,uint8,bytes32,bytes32)',
    [...permitArgs, ...parts(permitSignature)],
    zeroAddress,
  );
  const wrongDomainSignature = await signer.signTypedData({
    domain: { ...domain, chainId: 1 },
    types: { Permit: permitType },
    primaryType: 'Permit',
    message: permitMessage,
  });
  await execute(
    'permit wrong chain rejected',
    'permit(address,address,uint256,uint256,bytes)',
    [...permitArgs, wrongDomainSignature],
    zeroAddress,
    'EIP2612: invalid signature',
  );
  const badPermitNonceSignature = await signer.signTypedData({
    domain,
    types: { Permit: permitType },
    primaryType: 'Permit',
    message: { ...permitMessage, nonce: permitMessage.nonce + 1n },
  });
  await execute(
    'permit wrong nonce rejected',
    'permit(address,address,uint256,uint256,bytes)',
    [...permitArgs, badPermitNonceSignature],
    zeroAddress,
    'EIP2612: invalid signature',
  );
  await execute(
    'permit expired rejected',
    'permit(address,address,uint256,uint256,bytes)',
    [
      signer.address,
      recipient,
      1n,
      BigInt(block.timestamp) - 1n,
      permitSignature,
    ],
    zeroAddress,
    'ERC20Permit: expired deadline',
  );
  for (const [functionName, primaryType] of [
    ['transferWithAuthorization', 'TransferWithAuthorization'],
    ['receiveWithAuthorization', 'ReceiveWithAuthorization'],
  ]) {
    const signature = await signer.signTypedData({
      domain,
      types: { [primaryType]: authorizationType },
      primaryType,
      message: authMessage,
    });
    const args = [signer.address, recipient, 0n, 0n, deadline, nonce];
    const caller =
      functionName === 'receiveWithAuthorization' ? recipient : zeroAddress;
    await execute(
      `${primaryType} bytes zero-value valid`,
      `${functionName}(address,address,uint256,uint256,uint256,bytes32,bytes)`,
      [...args, signature],
      caller,
    );
    await execute(
      `${primaryType} vrs zero-value valid`,
      `${functionName}(address,address,uint256,uint256,uint256,bytes32,uint8,bytes32,bytes32)`,
      [...args, ...parts(signature)],
      caller,
    );
    await execute(
      `${primaryType} tampered amount rejected`,
      `${functionName}(address,address,uint256,uint256,uint256,bytes32,bytes)`,
      [signer.address, recipient, 1n, 0n, deadline, nonce, signature],
      caller,
      'TetherToken: invalid signature',
    );
    if (functionName === 'receiveWithAuthorization') {
      await execute(
        'receive third-party caller rejected',
        `${functionName}(address,address,uint256,uint256,uint256,bytes32,bytes)`,
        [...args, signature],
        zeroAddress,
        'TetherToken: to != msg.sender',
      );
      const positiveSignature = await signer.signTypedData({
        domain,
        types: { [primaryType]: authorizationType },
        primaryType,
        message: { ...authMessage, value: 1n },
      });
      await execute(
        'receive valid positive value reaches balance check',
        `${functionName}(address,address,uint256,uint256,uint256,bytes32,bytes)`,
        [signer.address, recipient, 1n, 0n, deadline, nonce, positiveSignature],
        caller,
        'ERC20: transfer amount exceeds balance',
      );
      await execute(
        'receive validAfter exact boundary rejected',
        `${functionName}(address,address,uint256,uint256,uint256,bytes32,bytes)`,
        [
          signer.address,
          recipient,
          0n,
          BigInt(block.timestamp),
          deadline,
          nonce,
          signature,
        ],
        caller,
        'TetherToken: auth early',
      );
      await execute(
        'receive validBefore exact boundary rejected',
        `${functionName}(address,address,uint256,uint256,uint256,bytes32,bytes)`,
        [
          signer.address,
          recipient,
          0n,
          0n,
          BigInt(block.timestamp),
          nonce,
          signature,
        ],
        caller,
        'TetherToken: auth expired',
      );
    }
  }
  result.afterCalls = {
    permitNonce: await read('nonces', [signer.address]),
    allowance: await read('allowance', [signer.address, recipient]),
    authorizationUsed: await read('authorizationState', [
      signer.address,
      nonce,
    ]),
  };
  check(
    'eth_call changes were not persisted',
    result.afterCalls.permitNonce === result.probeAccount.permitNonce &&
      result.afterCalls.allowance === 0n &&
      !result.afterCalls.authorizationUsed,
  );
  const endBlock = await required('eth_getBlockByNumber', [tag, false]);
  check('snapshot block hash unchanged', endBlock.hash === block.hash);
  result.status = 'READ_ONLY_CAPABILITIES_VERIFIED';
  result.limitations = [
    'Zero-value eth_call and permit simulation only; no funded payment, mined transaction, receipt, durable nonce consumption or live replay proof.',
    'Recipient was an EOA impersonated via eth_call, not a deployed checkout contract.',
    'Proxy implementation and token-owner blocklist powers can change compatibility.',
  ];
} catch (error) {
  result.status = 'FAILED';
  result.error = error.message;
  process.exitCode = 1;
} finally {
  await mkdir('docs/evidence', { recursive: true });
  await writeFile(
    output,
    `${JSON.stringify(result, (_, value) => (typeof value === 'bigint' ? value.toString() : value), 2)}\n`,
  );
  console.log(
    JSON.stringify(
      {
        status: result.status,
        metadata: result.metadata,
        checks: result.checks,
        error: result.error,
        output,
      },
      null,
      2,
    ),
  );
}
