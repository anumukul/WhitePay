import { hashDomain } from 'viem';
import { WHITECHAIN_SEPOLIA } from '../../packages/shared/dist/index.js';

export function assertTarget(chainId, code) {
  if (BigInt(chainId) !== BigInt(WHITECHAIN_SEPOLIA.id)) {
    throw new Error('Refusing RPC: expected chain 1874');
  }
  if (!/^0x[\da-f]+$/i.test(code) || code === '0x' || /^0x0+$/.test(code)) {
    throw new Error('Official token has no bytecode');
  }
}

export function classifyCall(response) {
  if (response.error) return { status: 'error', error: response.error };
  if (
    typeof response.result !== 'string' ||
    !/^0x[\da-f]*$/i.test(response.result)
  ) {
    throw new Error('Malformed eth_call response');
  }
  return {
    status: response.result === '0x' ? 'empty' : 'returned',
    result: response.result,
  };
}

export function capabilityConclusion({
  abiPresent,
  selectorPresent,
  validSignatureCall,
}) {
  return abiPresent && selectorPresent && validSignatureCall
    ? 'CALL_VERIFIED_ONLY'
    : 'UNPROVEN';
}

// A hard allowlist prevents this investigation tool from broadcasting or unlocking accounts.
const methods = new Set([
  'eth_chainId',
  'eth_getCode',
  'eth_getStorageAt',
  'eth_getBlockByNumber',
  'eth_getBalance',
  'eth_call',
]);
export async function rpcRead(method, params, fetcher = fetch) {
  if (!methods.has(method))
    throw new Error(`Read-only probe refuses ${method}`);
  const response = await fetcher(WHITECHAIN_SEPOLIA.rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`RPC HTTP ${response.status}`);
  const body = await response.json();
  if (
    body.jsonrpc !== '2.0' ||
    body.id !== 1 ||
    (!('result' in body) && !body.error)
  ) {
    throw new Error('Malformed RPC envelope');
  }
  return body;
}

export function tokenDomainSeparator(domain) {
  return hashDomain({
    domain,
    types: {
      EIP712Domain: [
        { name: 'name', type: 'string' },
        { name: 'version', type: 'string' },
        { name: 'chainId', type: 'uint256' },
        { name: 'verifyingContract', type: 'address' },
      ],
    },
  });
}
