import Link from 'next/link';
import { requireCustomer } from '../../lib/customer';
import { creditBalance } from '../../lib/db/entitlements';
import { spend } from '../actions';
import { Icon, TestnetNote } from '../../components/ui';
export const dynamic = 'force-dynamic';
export default async function Credits() {
  const c = await requireCustomer(),
    balance = await creditBalance(c.id);
  return (
    <main id="main-content" className="page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">YOUR CREATIVE FUEL</p>
          <h1>Your credits</h1>
          <p className="muted">A little potential, ready whenever you are.</p>
        </div>
        <Link href="/checkout" className="button small-button">
          Get more credits <Icon name="arrow" size={16} />
        </Link>
      </div>
      <section className="balance-panel">
        <div>
          <p className="eyebrow">AVAILABLE TO CREATE</p>
          <div className="balance-number">
            <span data-testid="credit-balance">{balance}</span>
            <span>credits</span>
          </div>
          <p>Your balance is saved to this browser’s workspace.</p>
        </div>
        <div className="balance-art" aria-hidden="true">
          <Icon size={110} />
          <span className="balance-art-dot" />
        </div>
      </section>
      <div className="section-heading">
        <h2>Put your credits to work</h2>
        <span className="pill neutral">1 credit per action</span>
      </div>
      <section className="action-card">
        <span className="icon-tile large">
          <Icon name="bolt" size={28} />
        </span>
        <div className="action-copy">
          <h3>Try something small.</h3>
          <p>Run the sample action to spend one credit from your balance.</p>
          <p className="small muted">
            This demo consumes a credit in the database. It does not call a paid
            AI service.
          </p>
        </div>
        <form action={spend}>
          <button className="button" disabled={balance <= 0}>
            Run sample action — spend 1 credit <Icon name="arrow" size={17} />
          </button>
        </form>
      </section>
      {balance === 0 && (
        <div className="empty-note">
          <Icon name="layers" />
          <div>
            <strong>A fresh start looks good on you.</strong>
            <p>Pick up 100 credits to try your first sample action.</p>
          </div>
          <Link href="/checkout">Buy 100 credits ↗</Link>
        </div>
      )}
      <div className="bottom-banner">
        <div>
          <Icon name="shield" />
          <div>
            <strong>Every credit starts with a verified payment.</strong>
            <p>
              Credits are granted once, after the payment webhook confirms
              settlement.
            </p>
          </div>
        </div>
        <TestnetNote />
      </div>
    </main>
  );
}
