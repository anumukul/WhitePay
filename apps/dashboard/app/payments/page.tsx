import { api, usdt } from '../../lib/server';
export const dynamic = 'force-dynamic';
export default async function Payments() {
  const [{ data }, merchant] = await Promise.all([
    api('/v1/payments'),
    api('/v1/merchant'),
  ]);
  return (
    <main>
      <h1>Payments</h1>
      <p>
        {merchant.name} · Payout {merchant.payoutAddress}
      </p>
      {data.length === 0 ? (
        <p>No payments yet.</p>
      ) : (
        <table style={{ width: '100%' }}>
          <thead>
            <tr>
              <th>Payment</th>
              <th>Status</th>
              <th>Amount</th>
              <th>Receipt</th>
            </tr>
          </thead>
          <tbody>
            {data.map((p: any) => (
              <tr key={p.id}>
                <td>{p.id}</td>
                <td>{p.status}</td>
                <td>{usdt(p.amountMinor)}</td>
                <td>
                  {/^0x[0-9a-fA-F]{64}$/.test(p.txHash ?? '') ? (
                    <a
                      href={
                        'https://explorer.testnet.whitechain.io/tx/' + p.txHash
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      View receipt
                    </a>
                  ) : (
                    'Pending'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
