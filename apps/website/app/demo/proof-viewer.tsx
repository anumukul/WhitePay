'use client';
import { useState } from 'react';
import { evidence, links } from '../../lib/content.mjs';
export function ProofViewer() {
  const [view, setView] = useState<'buyer' | 'merchant'>('buyer');
  return (
    <div className="demo-content">
      <div className="demo-toggle" aria-label="Receipt perspective">
        <button
          aria-pressed={view === 'buyer'}
          onClick={() => setView('buyer')}
        >
          Buyer view
        </button>
        <button
          aria-pressed={view === 'merchant'}
          onClick={() => setView('merchant')}
        >
          Merchant view
        </button>
      </div>
      <section aria-live="polite">
        <p className="eyebrow">Confirmed · block {evidence.block}</p>
        <h2>
          {view === 'buyer'
            ? 'Authorized USDT. Spent zero WBT.'
            : 'Exact payout. Inspectable settlement.'}
        </h2>
        <dl>
          {view === 'buyer' ? (
            <>
              <div>
                <dt>Price + disclosed fee</dt>
                <dd className="value">1.001 USDT</dd>
              </div>
              <div>
                <dt>Payer WBT, before → after</dt>
                <dd className="value">0 → 0 WBT</dd>
              </div>
              <div>
                <dt>Payer public address</dt>
                <dd className="address">{evidence.payer}</dd>
              </div>
              <div>
                <dt>Authorization</dt>
                <dd>Two EIP-712 signatures</dd>
              </div>
            </>
          ) : (
            <>
              <div>
                <dt>Merchant received</dt>
                <dd className="value">1 USDT</dd>
              </div>
              <div>
                <dt>Fee recipient received</dt>
                <dd className="value">0.001 USDT</dd>
              </div>
              <div>
                <dt>Merchant public address</dt>
                <dd className="address">{evidence.merchant}</dd>
              </div>
              <div>
                <dt>Settlement behavior</dt>
                <dd>Atomic payouts; replay rejected</dd>
              </div>
            </>
          )}
        </dl>
      </section>
      <p className="small">
        Recorded {evidence.settledAt}. Whitechain Sepolia, chain{' '}
        {evidence.chainId}. Test assets have no real-money value.
      </p>
      <p className="address">Official token: {evidence.token}</p>
      <p className="address">
        Transaction: <a href={links.payment}>{evidence.transaction}</a>
      </p>
      <p className="notice">
        Live checkout hosting is pending. This viewer cannot connect a wallet,
        request a signature or broadcast. The real merchant integrations can be
        run locally using their own setup guides.
      </p>
      <div className="demo-links">
        <a href={links.saas}>Run the SaaS demo ↗</a>
        <a href={links.shop}>Run the shop demo ↗</a>
        <a href={links.evidence}>Read the verification report ↗</a>
        <a href="/pitch">View the pitch →</a>
      </div>
    </div>
  );
}
