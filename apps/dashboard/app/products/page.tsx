import { api, usdt } from '../../lib/server';
import { createProduct, renameProduct, createPrice } from '../actions';
export const dynamic = 'force-dynamic';
export default async function Products({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const [products, prices] = await Promise.all([
    api('/v1/products'),
    api('/v1/prices'),
  ]);
  return (
    <main>
      <h1>Products and prices</h1>
      {(await searchParams).error && (
        <p role="alert">
          Changes could not be saved. Check the values and try again.
        </p>
      )}
      <form action={createProduct}>
        <label htmlFor="name">New product name</label>
        <input id="name" name="name" required maxLength={200} />
        <button>Create product</button>
      </form>
      {products.data.map((p: any) => (
        <section
          key={p.id}
          style={{ borderTop: '1px solid #ddd', padding: '20px 0' }}
        >
          <h2>{p.name}</h2>
          <form action={renameProduct}>
            <input type="hidden" name="id" value={p.id} />
            <label htmlFor={'rename-' + p.id}>Product name</label>
            <input
              id={'rename-' + p.id}
              name="name"
              defaultValue={p.name}
              required
              maxLength={200}
            />
            <button>Rename product</button>
          </form>
          <ul>
            {prices.data
              .filter((v: any) => v.productId === p.id)
              .map((v: any) => (
                <li key={v.id}>
                  Version {v.version}: {usdt(v.amountMinor)} ·{' '}
                  <code>{v.id}</code>
                </li>
              ))}
          </ul>
          <form action={createPrice}>
            <input type="hidden" name="productId" value={p.id} />
            <label htmlFor={'amount-' + p.id}>
              New price in USDT minor units (1 USDT = 1000000)
            </label>
            <input
              id={'amount-' + p.id}
              name="amountMinor"
              type="number"
              min="1"
              max={Number.MAX_SAFE_INTEGER}
              step="1"
              required
            />
            <button>Add price version</button>
          </form>
          <p>New prices keep existing orders unchanged.</p>
        </section>
      ))}
    </main>
  );
}
