import { links } from '../lib/content.mjs';

export function Header() {
  return (
    <header className="site-header wrap">
      <a className="brand" href="/">
        WhitePay<span> / testnet</span>
      </a>
      <nav aria-label="Main navigation">
        <a href="/demo">Payment proof</a>
        <a href="/pitch">Pitch deck</a>
        <a href={links.docs}>Docs ↗</a>
      </nav>
    </header>
  );
}
