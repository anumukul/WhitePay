import Link from 'next/link';
import { requireCustomer } from '../../lib/customer';
import { buyCredits } from '../actions';
import { Icon, OrderSummary } from '../../components/ui';
export const dynamic = 'force-dynamic';
export default async function Checkout({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireCustomer();
  return (
    <main id="main-content" className="page checkout-page">
      <Link className="back-link" href="/">
        ← Back to workspace
      </Link>
      <div className="page-heading">
        <div>
          <p className="eyebrow">MAKE ROOM FOR WHAT’S NEXT</p>
          <h1>Buy 100 credits</h1>
          <p className="muted">
            One pack. One clear total. A little more possibility.
          </p>
        </div>
      </div>
      <div className="checkout-grid">
        <section className="checkout-details">
          <div className="checkout-feature-icon">
            <Icon size={30} />
          </div>
          <h2>Your next good idea starts here.</h2>
          <p className="muted">
            Add 100 credits to your personal workspace and try the sample action
            at your own pace.
          </p>
          <ul className="check-list">
            <li>
              <Icon name="check" />
              100 credits added after confirmed payment
            </li>
            <li>
              <Icon name="check" />1 credit per sample action
            </li>
            <li>
              <Icon name="check" />A transaction receipt on Whitechain Sepolia
            </li>
            <li>
              <Icon name="check" />
              Zero WBT required from your payer wallet
            </li>
          </ul>
          <div className="detail-note">
            <Icon name="shield" />
            <p>
              Your wallet signs the payment authorizations. The relayer pays
              gas, and your credits are delivered after the verified payment
              webhook.
            </p>
          </div>
          <p className="small muted">
            Testnet demo. Credits run a database-backed sample action; no paid
            AI service is called.
          </p>
        </section>
        <section className="checkout-card" aria-label="Order summary">
          <OrderSummary />
          {(await searchParams).error && (
            <p className="alert" role="alert">
              Checkout is not configured or could not be created. No credits or
              payment were recorded.
            </p>
          )}
          <form action={buyCredits}>
            <button className="button full">
              Continue to WhitePay <Icon name="arrow" size={18} />
            </button>
          </form>
          <p className="checkout-assurance">
            <Icon name="shield" size={14} /> Review and authorize in your wallet
          </p>
        </section>
      </div>
    </main>
  );
}
