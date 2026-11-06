export type Hex = `0x${string}`;

// Matches the shape used by services/relayer and services/worker.
// `number` fields match those services; viem conversions happen inside the client.
export interface Order {
  orderId: string;
  payer: string;
  merchant: string;
  amount: bigint;
  fee: bigint;
  feeRecipient: string;
  token: string;
  validAfter: number;
  validBefore: number;
  quoteId: string;
}

export interface SettledLog {
  blockNumber: number;
  txHash: string;
  logIndex: number;
  orderId: string;
  payer: string;
  merchant: string;
  token: string;
  amount: bigint;
  fee: bigint;
  feeRecipient: string;
  quoteId: string;
}

// Shape matches services/relayer/src/types.ts#ChainAdapter.
export interface ChainAdapter {
  chainId(): Promise<number>;
  nowSeconds(): number;
  getRelayerBalance(): Promise<bigint>;
  estimateSettleGas(order: Order, orderSig: string, tokenSig: string): Promise<bigint>;
  sendSettle(order: Order, orderSig: string, tokenSig: string, gasLimit: bigint): Promise<string>;
}

// Shape matches services/worker/src/indexer.ts#ChainReader.
export interface ChainReader {
  getHead(): Promise<number>;
  getLogs(fromBlock: number, toBlock: number): Promise<SettledLog[]>;
}
