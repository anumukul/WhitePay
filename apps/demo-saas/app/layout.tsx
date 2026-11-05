export const metadata = {
  title: "WhitePay SaaS Demo",
  description: "Demo SaaS integrating WhitePay (stubbed) and Stripe (real test mode)",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0, padding: 24 }}>
        <header style={{ marginBottom: 24 }}>
          <h1 style={{ margin: 0 }}>WhitePay SaaS Demo</h1>
          <p style={{ color: "#666" }}>Testnet / test-mode only. No real funds move.</p>
        </header>
        {children}
      </body>
    </html>
  );
}
