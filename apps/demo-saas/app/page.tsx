import Link from 'next/link';
import { startCustomer } from './actions';
import { customer } from '../lib/customer';
import { Icon, TestnetNote } from '../components/ui';
export const dynamic = 'force-dynamic';
export default async function Home() {
  const c = await customer();
  return (
    <main id="main-content" className="page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">A LITTLE ROOM TO CREATE</p>
          <h1>Welcome to your workspace.</h1>
          <p className="muted">
            Good ideas deserve a place to start. Make this one yours.
          </p>
        </div>
        <span className="pill">
          <span className="status-dot" />
          Testnet demo
        </span>
      </div>
      <section className="hero-panel">
        <div className="hero-copy">
          <span className="hero-label">
            <Icon size={15} /> LESS FRICTION. MORE POSSIBILITY.
          </span>
          <h2>
            Your next idea.
            <br />A little more <em>potential.</em>
          </h2>
          <p>
            Top up your creative credits with USDT. No WBT to buy, no gas
            balance to manage. Just a simpler way to get going.
          </p>
          {c ? (
            <Link className="button" href="/checkout">
              Buy credits <Icon name="arrow" size={17} />
            </Link>
          ) : (
            <form action={startCustomer}>
              <button className="button">
                Start your demo session <Icon name="arrow" size={17} />
              </button>
            </form>
          )}
          <span className="hero-footnote">
            100 credits · 5 USDT + 0.005 USDT fee
          </span>
        </div>
        <div
          className="hero-art"
          aria-label="Illustration of a creative workspace"
        >
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <div className="floating-star">
            <Icon size={40} />
          </div>
          <div className="preview-card">
            <div className="preview-header">
              <span className="mini-logo">f.</span>
              <span>YOUR NEXT CHAPTER</span>
              <span className="preview-dots">•••</span>
            </div>
            <div className="preview-visual">
              <div className="sculpture s-one" />
              <div className="sculpture s-two" />
              <div className="sculpture s-three" />
            </div>
            <div className="preview-caption">
              <strong>A little space for big ideas.</strong>
              <span>Sample workspace</span>
            </div>
          </div>
          <div className="floating-token">
            <span>₮</span>
            <div>
              <strong>Pay in USDT</strong>
              <small>Gas covered by your relayer</small>
            </div>
            <Icon name="check" size={17} />
          </div>
        </div>
      </section>
      <div className="section-heading">
        <h2>A smoother way to get started</h2>
        <span className="muted small">
          Three small steps. One clear payment.
        </span>
      </div>
      <section className="feature-grid" aria-label="How it works">
        {[
          {
            icon: 'layers',
            title: 'Pick up a little potential',
            text: 'One straightforward pack: 100 credits for your workspace. Every cost is shown before you sign.',
            number: '01',
          },
          {
            icon: 'credit',
            title: 'USDT in. Gas taken care of.',
            text: 'Authorize checkout with your wallet. A funded relayer pays the WBT gas on Whitechain Sepolia.',
            number: '02',
          },
          {
            icon: 'shield',
            title: 'A receipt you can follow',
            text: 'Your credits arrive after verified settlement. Follow the transaction directly on the chain explorer.',
            number: '03',
          },
        ].map((f) => (
          <article className="feature-card" key={f.number}>
            <div className="feature-top">
              <span className="icon-tile">
                <Icon name={f.icon} />
              </span>
              <span className="step-number">{f.number}</span>
            </div>
            <h3>{f.title}</h3>
            <p>{f.text}</p>
          </article>
        ))}
      </section>
      <div className="bottom-banner">
        <div>
          <Icon name="globe" />
          <div>
            <strong>A real checkout. A testnet playground.</strong>
            <p>
              This demo stores and spends credits. It does not call a paid AI
              service.
            </p>
          </div>
        </div>
        <TestnetNote />
      </div>
    </main>
  );
}
