import type { SettledLog } from '@whitepay/chain';
import type { Hex } from 'viem';
export interface WorkerReceipt {
  status: 'success' | 'reverted';
  transactionHash: string;
  blockNumber: number;
  blockHash: string;
  logs: readonly {
    address: string;
    data: Hex;
    topics: readonly Hex[];
    logIndex: number;
  }[];
}
export interface WorkerReader {
  chainId(): Promise<number>;
  getHead(): Promise<number>;
  getBlockHash(block: number): Promise<string>;
  getLogs(from: number, to: number): Promise<SettledLog[]>;
  getReceipt(hash: string): Promise<WorkerReceipt | null>;
}
export interface WorkerConfig {
  scope: string;
  chainId: 1874;
  checkoutAddress: string;
  fromBlock: number;
  confirmations: number;
  batchSize?: number;
}
