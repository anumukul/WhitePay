import Link from 'next/link';
import { requireCustomer } from '../../lib/customer';
import { creditBalance } from '../../lib/db/entitlements';
import { spend } from '../actions';
export const dynamic = 'force-dynamic';
export default async function Credits() {
  const c = await requireCustomer(),
    balance = await creditBalance(c.id);
  return (
    <main>
      <h2>Your credits</h2>
      <p data-testid="credit-balance">{balance}</p>
      <form action={spend}>
        <button disabled={balance <= 0}>
          Run sample action — spend 1 credit
        </button>
      </form>
      <p>
        This demo consumes a credit in the database. It does not call a paid AI
        service.
      </p>
      <Link href="/checkout">Buy 100 credits</Link>
    </main>
  );
}
