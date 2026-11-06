import type { Hex, TransactionSerializableEIP1559 } from 'viem';
export type UnsignedTransaction = TransactionSerializableEIP1559 & {
  to: Hex;
  data: Hex;
  nonce: number;
  gas: bigint;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
  chainId: 1874;
  value: 0n;
};
export interface RelayerConfig {
  expectedChainId: 1874;
  checkoutAddress: Hex;
  tokenAddress: Hex;
  feeRecipient: Hex;
  feeBasisPoints: number;
  maxGasPerSettle: bigint;
  maxGasPriceWei: bigint;
  priorityFeeWei: bigint;
  maxL1FeeWei: bigint;
  dailyBudgetWei: bigint;
  minimumValiditySeconds: number;
  mode: 'preview' | 'execute' | 'reconcile';
}
export interface ApprovedPayment {
  chainId: 1874;
  relayer: Hex;
  checkout: Hex;
  orderDigest: Hex;
  unsignedHash: Hex;
}
export interface ReceiptEvidence {
  transactionHash: Hex;
  status: 'success' | 'reverted';
  gasUsed: bigint;
  effectiveGasPrice: bigint;
  l1Fee: bigint;
  logs: readonly { address: string; data: Hex; topics: readonly Hex[] }[];
}
export interface ChainAdapter {
  relayerAddress: Hex;
  chainId(): Promise<number>;
  nowSeconds(): Promise<number>;
  getRelayerBalance(): Promise<bigint>;
  getNonce(tag: 'latest' | 'pending'): Promise<number>;
  simulate(data: Hex): Promise<bigint>;
  gasPrice(): Promise<bigint>;
  l1Fee(tx: UnsignedTransaction, signedRaw?: Hex): Promise<bigint>;
  sign(tx: UnsignedTransaction): Promise<Hex>;
  broadcast(raw: Hex): Promise<Hex>;
  receipt(hash: Hex): Promise<ReceiptEvidence | null>;
  transactionKnown(hash: Hex): Promise<boolean>;
}
export interface Result {
  id: string;
  status:
    | 'preview'
    | 'submitted'
    | 'pending'
    | 'mined'
    | 'failed'
    | 'quarantined'
    | 'locked';
  reason?: string;
  txHash?: string;
  unsignedHash?: string;
  gas?: string;
  reserveWei?: string;
  transactionPreview?: {
    nonce: number;
    gasLimit: string;
    maxFeePerGasWei: string;
    maxPriorityFeePerGasWei: string;
    nativeValueWei: string;
    calldataHash: Hex;
    gasEstimate: string;
    quotedL1FeeWei: string;
    observedGasPriceWei: string;
  };
}
export interface LoopResult {
  processed: number;
  details: Result[];
}
