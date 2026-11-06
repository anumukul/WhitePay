import type { ReactNode } from 'react';
import Link from 'next/link';
import { logout } from './actions';
export const metadata = {
  title: 'WhitePay merchant dashboard',
  description: 'Whitechain Sepolia merchant operations',
};
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: 'system-ui',
          margin: '32px auto',
          maxWidth: 1100,
          padding: '0 20px',
          lineHeight: 1.6,
        }}
      >
        <header>
          <strong>WhitePay · Testnet</strong>
          <nav style={{ display: 'flex', gap: 20, margin: '20px 0' }}>
            {[
              ['/payments', 'Payments'],
              ['/orders', 'Orders'],
              ['/products', 'Products'],
              ['/settings', 'Settings'],
            ].map(([href, label]) => (
              <Link prefetch={false} key={href} href={href}>
                {label}
              </Link>
            ))}
            <form action={logout}>
              <button>Sign out</button>
            </form>
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}
