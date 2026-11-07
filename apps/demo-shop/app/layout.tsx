import Link from 'next/link';
import { PRODUCT_NAME } from '../lib/product';
export const metadata = {
  title: 'WhitePay digital shop demo',
  description: 'Independent digital shop accepting official test USDT',
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: 'system-ui',
          maxWidth: 850,
          margin: '32px auto',
          padding: 24,
          lineHeight: 1.6,
        }}
      >
        <header>
          <h1>{PRODUCT_NAME}</h1>
          <p>Whitechain Sepolia testnet · official USDT · sponsored WBT gas</p>
          <nav>
            <Link href="/">Home</Link> ·{' '}
            <Link href="/downloads">Your downloads</Link>
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}
