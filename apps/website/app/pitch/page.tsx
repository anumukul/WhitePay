'use client';
import { useEffect, useState } from 'react';
import { slides, links, evidence } from '../../lib/content.mjs';
export default function Pitch() {
  const [hasPdf, setHasPdf] = useState(false);
  useEffect(() => {
    fetch('/whitepay-pitch.pdf', { method: 'HEAD' })
      .then((response) => setHasPdf(response.ok))
      .catch(() => setHasPdf(false));
  }, []);
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
      event.preventDefault();
      const current = Number(window.location.hash.replace('#slide-', '')) || 1;
      const next = Math.min(
        8,
        Math.max(1, current + (event.key === 'ArrowRight' ? 1 : -1)),
      );
      window.location.hash = 'slide-' + next;
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);
  return (
    <main className="pitch-page">
      <div className="pitch-controls">
        <a href="/">WhitePay / Pitch</a>
        <span>8 slides · ← → keys</span>
        <div>
          {hasPdf && <a href="/whitepay-pitch.pdf">Download PDF</a>}
          <button onClick={() => window.print()}>Print</button>
        </div>
      </div>
      {slides.map((slide, index) => (
        <div key={slide.label} className="slide-group">
          <section
            className="pitch-slide"
            id={'slide-' + (index + 1)}
            aria-label={`Slide ${index + 1}: ${slide.title}`}
          >
            <p className="eyebrow">{slide.label}</p>
            {index === 0 ? <h1>{slide.title}</h1> : <h2>{slide.title}</h2>}
            <p className="slide-body">{slide.body}</p>
            <ul>
              {slide.points.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
            {index === 4 && (
              <p className="slide-source">
                Checkout {evidence.checkout}
                <br />
                <a href={links.payment}>Transaction {evidence.transaction}</a>
              </p>
            )}
            <div className="slide-footer">
              <span>WHITEPAY · WHITECHAIN SEPOLIA · TESTNET ONLY</span>
              <span>{index + 1} / 8</span>
            </div>
          </section>
          <details className="speaker-notes">
            <summary>Speaker notes and sources</summary>
            <p>{slide.notes}</p>
          </details>
        </div>
      ))}
    </main>
  );
}
