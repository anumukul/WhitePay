import type { ChainAdapter, RelayerConfig, SignedSubmission, SubmitError } from "./types.js";
import { validate } from "./validate.js";
import { addDailySpend, dayKey, getSubmission, readDailySpend, recordSubmission } from "./db.js";

export interface SubmitSuccess {
  ok: true;
  txHash: string;
  gasEstimate: bigint;
  gasCapWei: bigint;
}
export interface SubmitFailure {
  ok: false;
  error: SubmitError;
}
export type SubmitResult = SubmitSuccess | SubmitFailure;

export async function submit(sub: SignedSubmission, cfg: RelayerConfig, chain: ChainAdapter): Promise<SubmitResult> {
  const existing = getSubmission(sub.order.orderId);
  if (existing && existing.txHash) return { ok: false, error: { code: "already_submitted", txHash: existing.txHash } };

  const chainId = await chain.chainId();
  const now = chain.nowSeconds();
  const vErr = validate(sub, cfg, now, chainId);
  if (vErr) return { ok: false, error: vErr };

  const gasEstimate = await chain.estimateSettleGas(sub.order, sub.orderSignature, sub.tokenSignature);
  if (gasEstimate > cfg.maxGasPerSettle) {
    return { ok: false, error: { code: "gas_exceeded", estimate: gasEstimate.toString(), cap: cfg.maxGasPerSettle.toString() } };
  }
  const gasCapWei = gasEstimate * cfg.maxGasPriceWei;

  const today = dayKey(Date.now());
  const spent = readDailySpend(today);
  if (spent + gasCapWei > cfg.dailyBudgetWei) {
    return { ok: false, error: { code: "budget_exceeded", spent: spent.toString(), cap: cfg.dailyBudgetWei.toString() } };
  }

  const balance = await chain.getRelayerBalance();
  if (balance < gasCapWei) return { ok: false, error: { code: "insufficient_relayer_balance" } };

  const txHash = await chain.sendSettle(sub.order, sub.orderSignature, sub.tokenSignature, gasEstimate);
  recordSubmission(sub.order.orderId, "submitted", txHash, gasCapWei);
  addDailySpend(today, gasCapWei);
  return { ok: true, txHash, gasEstimate, gasCapWei };
}
