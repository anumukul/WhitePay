import Link from "next/link";

export default function Home() {
  return (
    <main>
      <h2>Product: Guide to Whitechain (e-book)</h2>
      <p>5 USDT via WhitePay (placeholder) or Stripe test-mode card. One download per order.</p>
      <p>
        <Link href="/checkout">Go to checkout</Link>
      </p>
    </main>
  );
}
