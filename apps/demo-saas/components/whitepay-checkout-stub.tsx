// SWAP-POINT: replace with <WhitePayCheckout /> from @whitepay/react once Step 09 lands
"use client";
import { useState } from "react";

export interface WhitePayCheckoutProps {
  publishableKey: string;
  sessionId?: string;
  priceId?: string;
  onComplete?: (result: { paymentId: string }) => void;
  onError?: (err: Error) => void;
  appearance?: Record<string, unknown>;
}

export function WhitePayCheckout(props: WhitePayCheckoutProps) {
  const [busy, setBusy] = useState(false);
  const label = "Pay 5 USDT (placeholder)";

  async function go() {
    if (!props.sessionId) {
      props.onError?.(new Error("sessionId required (priceId convenience not implemented in stub)"));
      return;
    }
    setBusy(true);
    window.location.href = `/_stub/whitepay/pay/${props.sessionId}`;
  }

  return (
    <button
      onClick={go}
      disabled={busy}
      style={{
        padding: "12px 20px",
        fontSize: 16,
        background: "#111",
        color: "#fff",
        border: 0,
        borderRadius: 6,
        cursor: busy ? "wait" : "pointer",
      }}
      aria-label={label}
    >
      {busy ? "Redirecting…" : label}
    </button>
  );
}
