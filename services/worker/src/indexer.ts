import { getCursor, recordSettlement, setCursor } from "./db.js";

export interface SettledLog {
  blockNumber: number;
  txHash: string;
  // event PaymentSettled(bytes32 orderId, address payer, address merchant, address token, uint256 amount, uint256 fee, address feeRecipient, bytes32 quoteId)
  orderId: string;
  payer: string;
  merchant: string;
  token: string;
  amount: bigint;
  fee: bigint;
  feeRecipient: string;
  quoteId: string;
  logIndex: number;
}

export interface ChainReader {
  getHead(): Promise<number>;
  getLogs(fromBlock: number, toBlock: number): Promise<SettledLog[]>;
}

export interface ScanResult {
  processed: number;
  advancedTo: number;
}

export async function scanOnce(cfg: {
  scope: string;
  reader: ChainReader;
  batchSize?: number;
  confirmations?: number;
  onSettlement: (log: SettledLog, eventId: string) => Promise<void> | void;
}): Promise<ScanResult> {
  const batch = cfg.batchSize ?? 500;
  const conf = cfg.confirmations ?? 2;
  const head = await cfg.reader.getHead();
  const safeHead = head - conf;
  const cursor = getCursor(cfg.scope);
  const from = cursor + 1;
  if (from > safeHead) return { processed: 0, advancedTo: cursor };
  const to = Math.min(from + batch - 1, safeHead);
  const logs = await cfg.reader.getLogs(from, to);
  let processed = 0;
  for (const log of logs) {
    const eventId = `${log.txHash}:${log.logIndex}`;
    const { inserted } = recordSettlement({
      eventId,
      orderId: log.orderId,
      txHash: log.txHash,
      blockNumber: log.blockNumber,
      amountMinor: log.amount,
      merchantPayout: log.merchant,
      tokenAddress: log.token,
    });
    if (inserted) {
      await cfg.onSettlement(log, eventId);
      processed++;
    }
  }
  setCursor(cfg.scope, to);
  return { processed, advancedTo: to };
}
