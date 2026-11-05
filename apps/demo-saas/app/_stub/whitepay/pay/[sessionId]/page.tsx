// SWAP-POINT: replace with real WhitePay hosted checkout page once services/api + widget land
"use client";
import { useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";

export default function StubPayPage() {
  const params = useParams<{ sessionId: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const orderId = search.get("orderId") ?? "";

  async function fire(success: boolean) {
    setBusy(true);
    setErr(null);
    try {
      if (success) {
        const res = await fetch("/api/_stub/whitepay/webhook", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            orderId,
            sessionId: params.sessionId,
            forwardTo: "/api/webhooks/whitepay",
          }),
        });
        if (!res.ok) throw new Error(`webhook forward failed: ${res.status}`);
      }
      const redirect = success
        ? `/receipt?provider=whitepay&orderId=${encodeURIComponent(orderId)}&sessionId=${params.sessionId}`
        : `/checkout?canceled=1`;
      router.push(redirect);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <main style={{ maxWidth: 480 }}>
      <div style={{ padding: 12, background: "#fff3cd", border: "1px solid #ffeeba", marginBottom: 16 }}>
        <strong>PLACEHOLDER — not a real WhitePay payment.</strong> This page simulates the hosted checkout that will exist once the
        real WhitePay API and widget ship. No funds move.
      </div>
      <h2>Session {params.sessionId}</h2>
      <p>Order {orderId || "(none)"}</p>
      <p>Amount: 5 USDT on Whitechain Sepolia (chain {process.env.NEXT_PUBLIC_WHITEPAY_KEY ? "1874" : "1874"})</p>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={() => fire(true)} disabled={busy} style={btn}>
          Simulate successful payment
        </button>
        <button onClick={() => fire(false)} disabled={busy} style={{ ...btn, background: "#666" }}>
          Cancel
        </button>
      </div>
      {err && <p style={{ color: "crimson" }}>Error: {err}</p>}
    </main>
  );
}

const btn: React.CSSProperties = {
  padding: "10px 16px",
  background: "#111",
  color: "#fff",
  border: 0,
  borderRadius: 6,
  cursor: "pointer",
};
