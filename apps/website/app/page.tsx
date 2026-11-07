import { Header } from '../components/header';
import { evidence, links } from '../lib/content.mjs';
export default function Home() {
  return (
    <>
      <Header />
      <main>
        <section className="hero wrap">
          <div>
            <p className="eyebrow">Whitechain Sepolia · Public alpha</p>
            <h1>
              Accept USDT.
              <br />
              <span>Your customers don’t need WBT.</span>
            </h1>
            <p className="lead">
              Give customers one clear payment total. Let a funded relayer
              handle native gas. Verify the receipt and deliver the purchase
              once.
            </p>
            <div className="actions">
              <a className="button primary" href="/demo">
                Explore the payment proof ↗
              </a>
              <a className="text-link" href={links.docs}>
                Read the developer guide ↗
              </a>
            </div>
            <p className="small muted">
              Testnet only. Existing wallet signing. No real-money assets.
            </p>
          </div>
          <div
            className="receipt"
            aria-label="Historical verified payment summary"
          >
            <div className="receipt-top">
              <span>WHITEPAY / RECEIPT</span>
              <span className="confirmed">Confirmed</span>
            </div>
            <h2>
              One purchase.
              <br />
              No payer gas.
            </h2>
            <dl>
              <div>
                <dt>Merchant price</dt>
                <dd>1.000 USDT</dd>
              </div>
              <div>
                <dt>Sponsorship fee</dt>
                <dd>0.001 USDT</dd>
              </div>
              <div className="total">
                <dt>Customer total</dt>
                <dd>1.001 USDT</dd>
              </div>
              <div>
                <dt>Payer WBT</dt>
                <dd>0 → 0</dd>
              </div>
              <div>
                <dt>Network gas paid by</dt>
                <dd>Relayer</dd>
              </div>
            </dl>
            <a href={links.payment}>Inspect the actual transaction ↗</a>
            <p className="small muted">
              Historical widget payment · block {evidence.block}
              <br />
              Official test USDT · chain {evidence.chainId}
            </p>
          </div>
        </section>
        <section className="proof-strip">
          <div className="wrap">
            <p>Built on a real testnet payment.</p>
            <a href={links.contract}>Deployed checkout ↗</a>
            <a href={links.node}>Node alpha ↗</a>
            <a href={links.react}>React alpha ↗</a>
            <a href={links.github}>Open source ↗</a>
          </div>
        </section>
        <section className="wrap section" id="how-it-works">
          <p className="eyebrow">The checkout flow</p>
          <h2>
            Clear for the buyer.
            <br />
            Verifiable for the merchant.
          </h2>
          <ol className="flow">
            <li>
              <span>01</span>
              <h3>Create the session</h3>
              <p>
                Your backend fixes the product, price and customer ownership.
                Your secret key stays on the server.
              </p>
            </li>
            <li>
              <span>02</span>
              <h3>Review and authorize</h3>
              <p>
                The widget shows the price, fee and total. The customer signs
                two exact authorizations; no WBT or allowance transaction is
                required.
              </p>
            </li>
            <li>
              <span>03</span>
              <h3>Settle and deliver</h3>
              <p>
                The relayer pays WBT. Atomic payouts produce a receipt; a
                verified, deduplicated webhook unlocks the purchase.
              </p>
            </li>
          </ol>
        </section>
        <section className="integration">
          <div className="wrap integration-inner">
            <div>
              <p className="eyebrow">Made for merchant developers</p>
              <h2>
                A small frontend.
                <br />
                An explicit server boundary.
              </h2>
              <p>
                The React widget and Node SDK are published. Your authenticated
                bridge protects sessions, and your webhook handler owns
                fulfillment.
              </p>
              <a className="text-link" href={links.docs}>
                Follow the complete integration ↗
              </a>
            </div>
            <div>
              <pre aria-label="SDK installation commands">
                <code>
                  npm install @whitepay/node@alpha{'\n'}npm install
                  @whitepay/react@alpha
                </code>
              </pre>
              <p className="small">
                React 18+ · ESM · Node 20+
                <br />
                Configure your merchant API credentials. Hosted fulfillment
                setup is in progress.
              </p>
              <div className="package-links">
                <a href={links.node}>Server SDK ↗</a>
                <a href={links.react}>React widget ↗</a>
              </div>
            </div>
          </div>
        </section>
        <section className="wrap section">
          <p className="eyebrow">Two different purchases</p>
          <div className="section-heading">
            <h2>
              Same infrastructure.
              <br />
              Independent fulfillment.
            </h2>
            <p>
              Both merchant apps are implemented and tested with controlled
              receipts. Those tests are separate from the real widget
              transaction above.
            </p>
          </div>
          <div className="merchants">
            <article>
              <span className="merchant-kind">01 / SaaS</span>
              <h3>Buy credits. Use the product.</h3>
              <p>
                A verified payment grants credits once. The app stores the
                entitlement and lets the customer spend it.
              </p>
              <a href={links.saas}>Open the Forma SaaS ↗</a>
            </article>
            <article>
              <span className="merchant-kind">02 / Digital shop</span>
              <h3>Pay for a download.</h3>
              <p>
                A separate merchant configuration unlocks a download for the
                right customer. A duplicate webhook grants nothing extra.
              </p>
              <a href={links.shop}>Run the shop demo locally ↗</a>
            </article>
          </div>
        </section>
        <section className="wrap section boundaries" id="status">
          <div>
            <p className="eyebrow">Current boundaries</p>
            <h2>
              Tested in the open.
              <br />
              Still an alpha.
            </h2>
          </div>
          <div>
            <p>
              The final checkout is deployed and the official-USDT widget
              payment is verified. Both SDKs are public, with locally runnable
              documentation.
            </p>
            <ul>
              <li>Explorer source verification remains open.</li>
              <li>
                Public hosting, operational hardening and final adversarial
                checks remain pending.
              </li>
              <li>
                Existing wallet prompts are required; embedded onboarding is not
                established.
              </li>
              <li>No mainnet, refunds or recurring subscriptions.</li>
            </ul>
            <a href={links.evidence}>Read the settlement evidence ↗</a>
          </div>
        </section>
      </main>
      <footer className="wrap site-footer">
        <a className="brand" href="/">
          WhitePay
        </a>
        <span>Official test USDT. Sponsored WBT gas.</span>
        <a href="/pitch">Eight-slide pitch →</a>
      </footer>
    </>
  );
}
