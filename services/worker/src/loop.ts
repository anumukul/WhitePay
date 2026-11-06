import { scanOnce } from "./indexer.js";
import type { ChainReader, SettledLog } from "@whitepay/chain";
import { findSubmissionByOrderId, recordSettlement } from "./api-queue.js";

export interface WorkerLoopConfig {
  scope: string;
  batchSize?: number;
  confirmations?: number;
}

export interface WorkerLoopResult {
  processed: number;
  advancedTo: number;
  persisted: number;
  unmatched: number;
  duplicates: number;
}

export async function scanAndPersist(
  cfg: WorkerLoopConfig,
  reader: ChainReader,
): Promise<WorkerLoopResult> {
  let persisted = 0;
  let unmatched = 0;
  let duplicates = 0;

  const { processed, advancedTo } = await scanOnce({
    scope: cfg.scope,
    reader: {
      getHead: () => reader.getHead(),
      getLogs: (from, to) => reader.getLogs(from, to) as Promise<SettledLog[]>,
    },
    batchSize: cfg.batchSize,
    confirmations: cfg.confirmations,
    onSettlement: async (log) => {
      const match = findSubmissionByOrderId(log.orderId);
      if (!match) {
        unmatched++;
        return;
      }
      const result = recordSettlement({
        submissionId: match.submissionId,
        merchantId: match.merchantId,
        sessionId: match.sessionId,
        amountMinor: log.amount,
        txHash: log.txHash,
        blockNumber: log.blockNumber,
      });
      if (result.alreadyExists) duplicates++;
      else persisted++;
    },
  });
  return { processed, advancedTo, persisted, unmatched, duplicates };
}
