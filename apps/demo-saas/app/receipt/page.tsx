import Link from "next/link";
import { getEntitlement } from "@/lib/db/entitlements";

export const dynamic = "force-dynamic";

export default function Receipt({
  searchParams,
}: {
  searchParams: { provider?: string; orderId?: string };
}) {
  const orderId = searchParams.orderId ?? "";
  const provider = searchParams.provider ?? "";
  const ent = orderId ? getEntitlement(orderId) : undefined;

  return (
    <main style={{ maxWidth: 560 }}>
      <h2>Receipt</h2>
      <p>Provider: <strong>{provider || "(unknown)"}</strong></p>
      <p>Order: <code>{orderId || "(none)"}</code></p>
      {ent ? (
        <>
          <p>
            Payment ID: <code>{ent.providerPaymentId}</code>
          </p>
          <p>Credits granted: <strong>{ent.creditsGranted}</strong></p>
          {provider === "whitepay" ? (
            <p>
              Explorer: <em>(placeholder — will link to Whitechain Sepolia explorer once Step 04 lands)</em>
            </p>
          ) : (
            <p>
              Stripe test reference: <code>{ent.providerPaymentId}</code>
            </p>
          )}
        </>
      ) : (
        <p style={{ color: "#a00" }}>
          No entitlement for this order yet. Returning here after checkout does NOT grant credits by itself —
          credits are granted only when the verified webhook is received.
        </p>
      )}
      <p>
        <Link href="/credits">View credit balance</Link>
      </p>
    </main>
  );
}
