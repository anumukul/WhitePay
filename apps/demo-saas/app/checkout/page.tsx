import { requireCustomer } from '../../lib/customer';
import { buyCredits } from '../actions';
export const dynamic = 'force-dynamic';
export default async function Checkout({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireCustomer();
  return (
    <main>
      <h2>Buy 100 credits</h2>
      <p>
        Price: 5 USDT. Sponsorship fee: 0.005 USDT. Total: 5.005 USDT on
        Whitechain Sepolia.
      </p>
      {(await searchParams).error && (
        <p role="alert">
          Checkout is not configured or could not be created. No credits or
          payment were recorded.
        </p>
      )}
      <form action={buyCredits}>
        <button>Continue to WhitePay</button>
      </form>
    </main>
  );
}
