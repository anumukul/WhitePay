import { hashTypedData, recoverAddress, type Hex } from 'viem';
import type { WalletProvider } from '../src/checkout.js';
export function createApprovedWallet(options: {
  payer: Hex;
  order: any;
  token: any;
  validBefore: number;
  now: () => Promise<number>;
  balance: () => Promise<bigint>;
  signDigest: (hash: Hex) => Promise<Hex>;
}): WalletProvider {
  const hashes = [hashTypedData(options.order), hashTypedData(options.token)],
    cache = new Map<string, Hex>();
  let busy = false;
  const active = async () => {
    if (options.validBefore <= (await options.now()) + 120)
      throw new Error('quote_expired');
  };
  return {
    request: async ({ method, params }) => {
      if (['eth_accounts', 'eth_requestAccounts'].includes(method))
        return [options.payer];
      if (method === 'eth_chainId') return '0x752';
      if (method === 'eth_call') {
        const [call, tag] = params ?? [];
        if (
          (call as any)?.to?.toLowerCase() !==
            '0xcedfb56113143d55b2358b8cfbb0deb5ad2f55a7' ||
          (call as any)?.data?.toLowerCase() !==
            '0x70a08231' +
              options.payer.slice(2).toLowerCase().padStart(64, '0') ||
          tag !== 'latest'
        )
          throw new Error('wallet_request_denied');
        return '0x' + (await options.balance()).toString(16).padStart(64, '0');
      }
      if (method !== 'eth_signTypedData_v4' || busy)
        throw new Error('wallet_request_denied');
      const [payer, encoded] = params ?? [];
      if (
        typeof payer !== 'string' ||
        payer.toLowerCase() !== options.payer.toLowerCase() ||
        typeof encoded !== 'string'
      )
        throw new Error('wallet_request_denied');
      let hash: Hex;
      try {
        hash = hashTypedData(JSON.parse(encoded));
      } catch {
        throw new Error('wallet_request_denied');
      }
      if (!hashes.includes(hash)) throw new Error('wallet_request_denied');
      busy = true;
      try {
        await active();
        if (cache.has(hash)) return cache.get(hash)!;
        if (hash !== hashes[cache.size])
          throw new Error('wallet_request_denied');
        const signature = await options.signDigest(hash);
        await active();
        if (
          (await recoverAddress({ hash, signature })).toLowerCase() !==
          options.payer.toLowerCase()
        )
          throw new Error('invalid_signature');
        cache.set(hash, signature);
        return signature;
      } finally {
        busy = false;
      }
    },
  };
}
