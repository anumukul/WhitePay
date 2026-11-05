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

export interface SignedSubmission {
  order: Order;
  orderSignature: string;
  tokenSignature: string;
  expectedPriceMinor: bigint;
  expectedToken: string;
  expectedMerchant: string;
  expectedFeeBasisPoints: number;
}

export interface RelayerConfig {
  expectedChainId: number;
  checkoutAddress: string;
  maxGasPerSettle: bigint;
  maxGasPriceWei: bigint;
  dailyBudgetWei: bigint;
  maxFeeBasisPointsDrift: number;
}

export interface ChainAdapter {
  chainId(): Promise<number>;
  nowSeconds(): number;
  getRelayerBalance(): Promise<bigint>;
  estimateSettleGas(order: Order, orderSig: string, tokenSig: string): Promise<bigint>;
  sendSettle(order: Order, orderSig: string, tokenSig: string, gasLimit: bigint): Promise<string>;
}

export type SubmitError =
  | { code: "wrong_chain" }
  | { code: "token_mismatch" }
  | { code: "merchant_mismatch" }
  | { code: "amount_mismatch" }
  | { code: "fee_out_of_band" }
  | { code: "time_window_invalid" }
  | { code: "time_expired" }
  | { code: "already_submitted"; txHash: string }
  | { code: "gas_exceeded"; estimate: string; cap: string }
  | { code: "budget_exceeded"; spent: string; cap: string }
  | { code: "insufficient_relayer_balance" };
