import * as React from "react";

if (typeof process !== "undefined" && process.env && process.env.WHITEPAY_SECRET_KEY && typeof window !== "undefined") {
  // Can't detect bundler leaks reliably, but refuse to render anything if a secret
  // key somehow made it to the client.
  throw new Error("@whitepay/react must not be bundled with WHITEPAY_SECRET_KEY");
}

export interface WhitePayCheckoutProps {
  publishableKey: string;
  sessionId?: string;
  priceId?: string;
  onComplete?: (result: { paymentId: string }) => void;
  onError?: (err: Error) => void;
  appearance?: { label?: string; buttonStyle?: React.CSSProperties };
}

export interface ResolvedQuote {
  priceId: string;
  amountMinor: number;
  currency: string;
  feeMinor: number;
  totalMinor: number;
  tokenAddress: string;
  chainId: number;
}

/**
 * Public checkout widget. Renders a button; on click, navigates to the merchant
 * session's redirectUrl. The quote displayed must come from the server-created
 * session — never from browser-supplied values — so that price changes are
 * impossible from the client.
 */
export function WhitePayCheckout(props: WhitePayCheckoutProps): React.ReactElement {
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  if (!props.publishableKey) {
    return (
      <div role="alert" style={{ color: "crimson" }}>
        WhitePayCheckout: publishableKey is required.
      </div>
    );
  }
  if (!props.sessionId) {
    return (
      <div role="alert" style={{ color: "crimson" }}>
        WhitePayCheckout: sessionId is required. Create it on your server via @whitepay/node,
        never from the browser.
      </div>
    );
  }

  async function go(): Promise<void> {
    setBusy(true);
    setErr(null);
    try {
      // The merchant backend created this session and returned the redirectUrl.
      // The widget just navigates; it never talks to a WhitePay API directly.
      window.location.href = buildRedirectUrl(props.sessionId!);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setErr(msg);
      props.onError?.(new Error(msg));
      setBusy(false);
    }
  }

  const label = props.appearance?.label ?? "Pay with WhitePay (USDT)";
  const style: React.CSSProperties = {
    padding: "12px 20px",
    fontSize: 16,
    background: "#111",
    color: "#fff",
    border: 0,
    borderRadius: 6,
    cursor: busy ? "wait" : "pointer",
    ...props.appearance?.buttonStyle,
  };

  return (
    <div>
      <button type="button" onClick={go} disabled={busy} aria-label={label} style={style}>
        {busy ? "Redirecting…" : label}
      </button>
      {err && (
        <div role="alert" style={{ color: "crimson", marginTop: 8 }}>
          {err}
        </div>
      )}
    </div>
  );
}

/**
 * Pure helper: given a sessionId, returns the path to the hosted checkout page.
 * Exported for tests; apps should normally rely on the widget's onClick.
 */
export function buildRedirectUrl(sessionId: string): string {
  if (!/^cs_[a-zA-Z0-9]+$/.test(sessionId)) {
    throw new Error(`Invalid sessionId format: ${sessionId}`);
  }
  return `/checkout/${sessionId}`;
}
