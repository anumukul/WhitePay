import Link from "next/link";
import { getDownloadByOrder } from "@/lib/db/entitlements";

export const dynamic = "force-dynamic";

export default function DownloadPage({
  searchParams,
}: {
  searchParams: { provider?: string; orderId?: string };
}) {
  const orderId = searchParams.orderId ?? "";
  const provider = searchParams.provider ?? "";
  const row = orderId ? getDownloadByOrder(orderId) : undefined;

  return (
    <main style={{ maxWidth: 560 }}>
      <h2>Download</h2>
      <p>Order: <code>{orderId || "(none)"}</code> · Provider: <strong>{provider || "(unknown)"}</strong></p>
      {row ? (
        <>
          <p>Payment ID: <code>{row.providerPaymentId}</code></p>
          {row.consumedAt ? (
            <p style={{ color: "#a00" }}>This download link has already been used.</p>
          ) : (
            <p>
              <Link href={`/api/download?token=${row.downloadToken}`}>
                Click to download (one-time)
              </Link>
            </p>
          )}
        </>
      ) : (
        <p style={{ color: "#a00" }}>
          No entitlement for this order yet. The success page alone does NOT unlock the download —
          only the verified webhook does.
        </p>
      )}
    </main>
  );
}
