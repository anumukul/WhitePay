import { scanOnce } from "./indexer.js";
import type { ChainReader, SettledLog } from "@whitepay/chain";
import { findSubmissionByOrderId, recordSettlement, getMerchantWebhookInfo } from "./api-queue.js";
import { deliverWebhook, type FetchLike } from "./webhooks.js";
import { buildPaymentSucceededEvent } from "./events.js";

export interface WorkerLoopConfig {
  scope: string;
  batchSize?: number;
  confirmations?: number;
  chainId?: number;
  fetchImpl?: FetchLike;
  webhookMaxAttempts?: number;
}

export interface WorkerLoopResult {
  processed: number;
  advancedTo: number;
  persisted: number;
  unmatched: number;
  duplicates: number;
  webhooksDelivered: number;
  webhooksFailed: number;
  webhooksSkipped: number;
}

export async function scanAndPersist(
  cfg: WorkerLoopConfig,
  reader: ChainReader,
): Promise<WorkerLoopResult> {
  let persisted = 0;
  let unmatched = 0;
  let duplicates = 0;
  let webhooksDelivered = 0;
  let webhooksFailed = 0;
  let webhooksSkipped = 0;

  const fetchImpl = cfg.fetchImpl ?? defaultFetchImpl;
  const chainId = cfg.chainId ?? 1874;

  const { processed, advancedTo } = await scanOnce({
    scope: cfg.scope,
    reader: {
      getHead: () => reader.getHead(),
      getLogs: (from, to) => reader.getLogs(from, to) as Promise<SettledLog[]>,
    },
    batchSize: cfg.batchSize,
    confirmations: cfg.confirmations,
    onSettlement: async (log, eventId) => {
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
      if (result.alreadyExists) {
        duplicates++;
        return;
      }
      persisted++;

      // Deliver signed webhook to merchant.
      const merchant = getMerchantWebhookInfo(match.merchantId);
      if (!merchant || !merchant.webhookUrl) {
        webhooksSkipped++;
        return;
      }
      const event = buildPaymentSucceededEvent({
        eventId,
        log,
        paymentId: result.paymentId,
        sessionId: match.sessionId,
        merchantId: match.merchantId,
        chainId,
      });
      try {
        const delivery = await deliverWebhook({
          eventId,
          url: merchant.webhookUrl,
          secret: merchant.webhookSecret,
          payload: JSON.stringify(event),
          maxAttempts: cfg.webhookMaxAttempts,
          fetchImpl,
        });
        if (delivery.delivered) webhooksDelivered++;
        else webhooksFailed++;
      } catch {
        webhooksFailed++;
      }
    },
  });
  return {
    processed,
    advancedTo,
    persisted,
    unmatched,
    duplicates,
    webhooksDelivered,
    webhooksFailed,
    webhooksSkipped,
  };
}

const defaultFetchImpl: FetchLike = async (url, init) => {
  try {
    const res = await fetch(url, init);
    return { ok: res.ok, status: res.status };
  } catch {
    return { ok: false, status: 0 };
  }
};
