import type { RelayerConfig, SignedSubmission, SubmitError } from "./types.js";

export function validate(sub: SignedSubmission, cfg: RelayerConfig, nowSec: number, chainId: number): SubmitError | null {
  if (chainId !== cfg.expectedChainId) return { code: "wrong_chain" };
  if (sub.order.token.toLowerCase() !== sub.expectedToken.toLowerCase()) return { code: "token_mismatch" };
  if (sub.order.merchant.toLowerCase() !== sub.expectedMerchant.toLowerCase()) return { code: "merchant_mismatch" };
  if (sub.order.amount !== sub.expectedPriceMinor) return { code: "amount_mismatch" };
  // Fee may be positive but must not exceed quoted fee by more than drift tolerance.
  const expectedFee = (sub.expectedPriceMinor * BigInt(sub.expectedFeeBasisPoints)) / 10_000n;
  const drift = (expectedFee * BigInt(cfg.maxFeeBasisPointsDrift)) / 10_000n;
  if (sub.order.fee < expectedFee - drift || sub.order.fee > expectedFee + drift) {
    return { code: "fee_out_of_band" };
  }
  if (sub.order.validBefore <= sub.order.validAfter) return { code: "time_window_invalid" };
  if (nowSec <= sub.order.validAfter || nowSec >= sub.order.validBefore) return { code: "time_expired" };
  return null;
}
