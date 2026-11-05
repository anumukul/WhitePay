import Link from "next/link";

export default function Home() {
  return (
    <main>
      <h2>Product: 100 credits</h2>
      <p>Buy 100 credits for 5 USDT (WhitePay placeholder) or the equivalent test-mode card price (Stripe).</p>
      <ul>
        <li><Link href="/checkout">Go to checkout</Link></li>
        <li><Link href="/credits">View credits</Link></li>
      </ul>
    </main>
  );
}
