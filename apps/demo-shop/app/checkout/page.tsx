import { requireCustomer } from '../../lib/customer';
import { buyTemplate } from '../actions';
import { PRODUCT_PRICE_MINOR } from '../../lib/product';
export const dynamic = 'force-dynamic';
export default async function Checkout({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireCustomer();
  const price = (PRODUCT_PRICE_MINOR / 1_000_000).toFixed(3);
  return (
    <main>
      <h2>Buy the template</h2>
      <p>
        Price: {price} USDT. Sponsorship fee: 0.003 USDT. Total: 3.003 USDT on
        Whitechain Sepolia.
      </p>
      {(await searchParams).error && (
        <p role="alert">
          Checkout is not configured or could not be created. No download or
          payment was recorded.
        </p>
      )}
      <form action={buyTemplate}>
        <button>Continue to WhitePay</button>
      </form>
    </main>
  );
}
