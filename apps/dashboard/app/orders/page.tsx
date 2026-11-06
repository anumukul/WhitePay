import { api, usdt } from '../../lib/server';
export const dynamic = 'force-dynamic';
export default async function Orders() {
  const { data } = await api('/v1/checkout/sessions');
  return (
    <main>
      <h1>Orders</h1>
      {data.length === 0 ? (
        <p>No orders yet.</p>
      ) : (
        <table style={{ width: '100%' }}>
          <thead>
            <tr>
              <th>Order</th>
              <th>Session</th>
              <th>Status</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {data.map((s: any) => (
              <tr key={s.id}>
                <td>{s.externalOrderId}</td>
                <td>{s.id}</td>
                <td>{s.status}</td>
                <td>{usdt(s.amountMinor)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
