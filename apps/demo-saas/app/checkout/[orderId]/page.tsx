import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireCustomer } from '../../../lib/customer';
import { orderForCustomer } from '../../../lib/db/index';
import { getEntitlement } from '../../../lib/db/entitlements';
import { CheckoutWidget } from './widget';
import { Icon, OrderSummary } from '../../../components/ui';
export const dynamic = 'force-dynamic';
export default async function Payment({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const c = await requireCustomer(),
    order = await orderForCustomer((await params).orderId, c.id);
  if (!order?.sessionId) notFound();
  const entitlement = await getEntitlement(order.id, c.id);
  return (
    <main id="main-content" className="page checkout-page">
      <Link href="/checkout" className="back-link">
        ← Back to credits pack
      </Link>
      <div className="page-heading">
        <div>
          <p className="eyebrow">THE LAST LITTLE STEP</p>
          <h1>100 credits checkout</h1>
          <p className="muted">
            Review the details. Your wallet keeps you in control.
          </p>
        </div>
        <span className="pill">
          <Icon name="shield" size={14} />
          Powered by WhitePay
        </span>
      </div>
      <div className="payment-grid">
        <section className="checkout-card payment-widget">
          <div className="card-heading">
            <span className="icon-tile">
              <Icon name="credit" />
            </span>
            <div>
              <h2>Complete your payment</h2>
              <p className="muted small">Official USDT · Whitechain Sepolia</p>
            </div>
          </div>
          <CheckoutWidget sessionId={order.sessionId} />
          <div
            className={
              entitlement ? 'delivery-note delivered' : 'delivery-note'
            }
          >
            <Icon name={entitlement ? 'check' : 'shield'} />
            {entitlement ? (
              <p role="status">100 credits granted.</p>
            ) : (
              <p>
                Credits are delivered only after the verified payment webhook. A
                browser callback cannot grant them.
              </p>
            )}
          </div>
          <Link href="/credits" className="text-link">
            Check your credit balance <Icon name="arrow" size={16} />
          </Link>
        </section>
        <aside className="checkout-card summary-card">
          <OrderSummary />
        </aside>
      </div>
    </main>
  );
}
