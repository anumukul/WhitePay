import { cookies } from "next/headers";
import Link from "next/link";
import { listPayments } from "@/lib/api-client";

export const dynamic = "force-dynamic";

export default async function PaymentsPage() {
  const key = (await cookies()).get("dashboard_api_key")?.value;
  if (!key) {
    return (
      <main>
        <p>Not signed in. <Link href="/">Sign in</Link>.</p>
      </main>
    );
  }
  const apiBaseUrl = process.env.WHITEPAY_API_URL ?? "http://localhost:3001";
  let rows: unknown[] = [];
  let err: string | null = null;
  try {
    rows = await listPayments(key, apiBaseUrl);
  } catch (e: unknown) {
    err = e instanceof Error ? e.message : String(e);
  }
  return (
    <main>
      <h2>Payments</h2>
      {err && <p style={{ color: "crimson" }}>Error: {err}</p>}
      {!err && rows.length === 0 && <p>No payments yet.</p>}
      {!err && rows.length > 0 && (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
              <th>ID</th><th>Status</th><th>Amount</th><th>Tx</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r: any) => (
              <tr key={r.id} style={{ borderBottom: "1px solid #f0f0f0" }}>
                <td><code>{r.id}</code></td>
                <td>{r.status}</td>
                <td>{r.amountMinor}</td>
                <td>{r.txHash ? <code>{r.txHash.slice(0, 10)}…</code> : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
