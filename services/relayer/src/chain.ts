import { serializeTransaction, parseAbi, keccak256, type Hex } from 'viem';
import type { WhitePayChainClient } from '@whitepay/chain';
import type { ChainAdapter, UnsignedTransaction } from './types.js';
// Signing is injected by the operator; this module never reads wallet keys or passwords.
export function createRelayerAdapter(
  client: WhitePayChainClient,
  relayerAddress: Hex,
  expectedRuntimeHash: Hex,
  signer?: (tx: UnsignedTransaction) => Promise<Hex>,
): ChainAdapter {
  const p = client.publicClient;
  return {
    relayerAddress,
    chainId: () => client.getChainId(),
    nowSeconds: async () => {
      const blockTime = Number((await p.getBlock()).timestamp);
      return Math.max(blockTime, Math.floor(Date.now() / 1000));
    },
    getRelayerBalance: () => p.getBalance({ address: relayerAddress }),
    getNonce: (tag) =>
      p.getTransactionCount({ address: relayerAddress, blockTag: tag }),
    simulate: async (data) => {
      const code = await p.getCode({ address: client.configCheckoutAddress() });
      if (!code || keccak256(code) !== expectedRuntimeHash)
        throw new Error('checkout_runtime_mismatch');
      return p.estimateGas({
        account: relayerAddress,
        to: client.configCheckoutAddress(),
        data,
        value: 0n,
      });
    },
    gasPrice: () => p.getGasPrice(),
    l1Fee: (tx, signedRaw) =>
      p.readContract({
        address: '0x420000000000000000000000000000000000000F',
        abi: parseAbi(['function getL1Fee(bytes) view returns(uint256)']),
        functionName: 'getL1Fee',
        args: [signedRaw ?? serializeTransaction(tx)],
      }),
    sign: async (tx) => {
      if (!signer) throw new Error('operator_signer_required');
      return signer(tx);
    },
    broadcast: (raw) => p.sendRawTransaction({ serializedTransaction: raw }),
    transactionKnown: async (hash) => {
      try {
        await p.getTransaction({ hash });
        return true;
      } catch (e) {
        if (e instanceof Error && e.name === 'TransactionNotFoundError')
          return false;
        throw e;
      }
    },
    receipt: async (hash) => {
      const raw = await p.request({
        method: 'eth_getTransactionReceipt',
        params: [hash],
      });
      if (!raw) return null;
      const extended = raw as typeof raw & { l1Fee?: Hex };
      if (extended.l1Fee === undefined)
        throw new Error('l1_receipt_fee_missing');
      const latest = await p.getBlockNumber();
      if (latest < BigInt(raw.blockNumber) + BigInt(client.confirmations - 1))
        return null;
      const canonical = await p.getBlock({
        blockNumber: BigInt(raw.blockNumber),
      });
      if (canonical.hash !== raw.blockHash)
        throw new Error('noncanonical_receipt');
      return {
        transactionHash: raw.transactionHash,
        status: raw.status === '0x1' ? 'success' : 'reverted',
        gasUsed: BigInt(raw.gasUsed),
        effectiveGasPrice: BigInt(raw.effectiveGasPrice),
        l1Fee: BigInt(extended.l1Fee),
        logs: raw.logs.map((l) => ({
          address: l.address,
          data: l.data,
          topics: l.topics,
        })),
      };
    },
  };
}
