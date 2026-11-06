export const metadata = { title: "WhitePay Dashboard" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0, padding: 24 }}>
        <header style={{ marginBottom: 24 }}>
          <h1 style={{ margin: 0 }}>WhitePay merchant dashboard</h1>
          <p style={{ color: "#666" }}>Testnet demo. Paste your API key to view your own payments.</p>
        </header>
        {children}
      </body>
    </html>
  );
}
