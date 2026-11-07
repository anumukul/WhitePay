import Link from 'next/link';
export const metadata = {
  title: 'WhitePay AI credits demo',
  description: 'Independent merchant accepting official test USDT',
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
          <h1>AI credits demo</h1>
          <p>Whitechain Sepolia testnet · official USDT · sponsored WBT gas</p>
          <nav>
            <Link href="/">Home</Link> · <Link href="/credits">Credits</Link>
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}
