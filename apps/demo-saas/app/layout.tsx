import Link from 'next/link';
import { Navigation } from '../components/navigation';
import { Icon } from '../components/ui';
import './globals.css';
export const metadata = {
  title: 'Forma — Creative credits, powered by WhitePay',
  description:
    'A creative credits workspace with official USDT checkout on Whitechain Sepolia.',
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        <Navigation />
        <div className="workspace">
          <header className="topbar">
            <div className="workspace-name">
              <span className="workspace-avatar">F</span>
              <span>
                Personal workspace <span className="workspace-tag">DEMO</span>
              </span>
            </div>
            <div className="topbar-right">
              <a className="powered" href="https://whitepay-website.vercel.app">
                Powered by{' '}
                <strong>
                  WhitePay <span>↗</span>
                </strong>
              </a>
              <span
                className="profile-avatar"
                aria-label="Demo workspace member"
              >
                You
              </span>
            </div>
          </header>
          {children}
          <footer className="app-footer">
            <span>Made for your next good idea.</span>
            <span>
              Forma demo <span className="footer-dot">·</span>{' '}
              <Link href="https://whitepay-docs.vercel.app">
                Payment documentation ↗
              </Link>
            </span>
          </footer>
        </div>
      </body>
    </html>
  );
}
