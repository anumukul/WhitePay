import './globals.css';
export const metadata = {
  title: 'WhitePay — Accept USDT without customer WBT',
  description:
    'Gas-sponsored checkout on Whitechain Sepolia. Public alpha SDKs, exact USDT authorizations and verifiable settlement.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
