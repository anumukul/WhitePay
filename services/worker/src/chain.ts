import { keccak256, type Hex } from 'viem';
import type { WhitePayChainClient } from '@whitepay/chain';
import type { WorkerReader } from './types.js';
export function createWorkerReader(
  client: WhitePayChainClient,
  runtimeHash: Hex,
): WorkerReader {
  const p = client.publicClient;
  return {
    chainId: () => client.getChainId(),
    getHead: () => client.getHead(),
    getBlockHash: async (block) =>
      (await p.getBlock({ blockNumber: BigInt(block) })).hash!,
    getLogs: (from, to) => client.getLogs(from, to),
    getReceipt: async (hash) => {
      const raw = await p.request({
        method: 'eth_getTransactionReceipt',
        params: [hash as Hex],
      });
      if (!raw) return null;
      const runtime = await p.getCode({
        address: client.configCheckoutAddress(),
        blockNumber: BigInt(raw.blockNumber),
      });
      if (!runtime || keccak256(runtime) !== runtimeHash)
        throw new Error('unexpected_checkout_runtime');
      return {
        status: raw.status === '0x1' ? 'success' : 'reverted',
        transactionHash: raw.transactionHash,
        blockNumber: Number(BigInt(raw.blockNumber)),
        blockHash: raw.blockHash,
        logs: raw.logs.map((l) => ({
          address: l.address,
          topics: l.topics,
          data: l.data,
          logIndex: Number(BigInt(l.logIndex!)),
        })),
      };
    },
  };
}
