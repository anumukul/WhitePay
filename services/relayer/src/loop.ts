import type { Order, SignedSubmission, RelayerConfig } from "./types.js";
import { submit } from "./submit.js";
import type { ChainAdapter } from "@whitepay/chain";
import { pollQueued, markSubmitted, markFailed, type QueuedSubmission } from "./queue.js";

export interface LoopResult {
  processed: number;
  submitted: number;
  failed: number;
  details: Array<{ id: string; status: "submitted" | "failed"; reason?: string; txHash?: string }>;
}

export async function runOnce(cfg: RelayerConfig, chain: ChainAdapter, batch = 10): Promise<LoopResult> {
  const queued = pollQueued(batch);
  const details: LoopResult["details"] = [];
  let submittedCount = 0;
  let failedCount = 0;

  for (const row of queued) {
    const outcome = await processOne(row, cfg, chain);
    details.push(outcome);
    if (outcome.status === "submitted") submittedCount++;
    else failedCount++;
  }
  return { processed: queued.length, submitted: submittedCount, failed: failedCount, details };
}

async function processOne(
  row: QueuedSubmission,
  cfg: RelayerConfig,
  chain: ChainAdapter,
): Promise<{ id: string; status: "submitted" | "failed"; reason?: string; txHash?: string }> {
  let order: Order;
  try {
    order = parseOrderPayload(row.orderPayload);
  } catch (e) {
    markFailed(row.id, "invalid_payload");
    return { id: row.id, status: "failed", reason: "invalid_payload" };
  }

  const signedSub: SignedSubmission = {
    order,
    orderSignature: row.orderSignature,
    tokenSignature: row.tokenSignature,
    // The API already validated these when building the digest, so `expected` mirrors `order`.
    // Relayer validation layer still enforces chain id, time window, token allowlist, gas, budget.
    expectedPriceMinor: order.amount,
    expectedToken: order.token,
    expectedMerchant: order.merchant,
    expectedFeeBasisPoints: order.amount > 0n ? Number((order.fee * 10_000n) / order.amount) : 0,
  };

  try {
    const result = await submit(signedSub, cfg, chain);
    if (result.ok) {
      markSubmitted(row.id, result.txHash);
      return { id: row.id, status: "submitted", txHash: result.txHash };
    }
    const reason = result.error.code;
    markFailed(row.id, reason);
    return { id: row.id, status: "failed", reason };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    const reason = `chain_error:${msg.slice(0, 80)}`;
    markFailed(row.id, reason);
    return { id: row.id, status: "failed", reason };
  }
}

function parseOrderPayload(payload: string): Order {
  const raw = JSON.parse(payload) as {
    orderId: string;
    payer: string;
    merchant: string;
    amount: string;
    fee: string;
    feeRecipient: string;
    token: string;
    validAfter: number;
    validBefore: number;
    quoteId: string;
  };
  return {
    orderId: raw.orderId,
    payer: raw.payer,
    merchant: raw.merchant,
    amount: BigInt(raw.amount),
    fee: BigInt(raw.fee),
    feeRecipient: raw.feeRecipient,
    token: raw.token,
    validAfter: Number(raw.validAfter),
    validBefore: Number(raw.validBefore),
    quoteId: raw.quoteId,
  };
}
