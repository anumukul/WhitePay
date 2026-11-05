import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import { getProvider, type ProviderId } from "@/lib/payments";

async function startCheckout(formData: FormData) {
  "use server";
  const provider = String(formData.get("provider") ?? "") as ProviderId;
  if (provider !== "stripe" && provider !== "whitepay") throw new Error("invalid provider");
  const orderId = `shop_${randomUUID()}`;
  const base = process.env.APP_BASE_URL ?? "http://localhost:3100";
  const priceId = provider === "stripe"
    ? process.env.STRIPE_PRICE_ID ?? ""
    : process.env.WHITEPAY_PRICE_ID ?? "price_shop_ebook";
  if (!priceId) throw new Error(`price id for ${provider} not configured`);
  const result = await getProvider(provider).createCheckout({
    orderId,
    priceId,
    successUrl: `${base}/download?provider=${provider}&orderId=${orderId}`,
    cancelUrl: `${base}/checkout?canceled=1`,
  });
  redirect(result.redirectUrl);
}

export default function CheckoutPage({ searchParams }: { searchParams: { canceled?: string } }) {
  return (
    <main style={{ maxWidth: 520 }}>
      <h2>Buy e-book: Guide to Whitechain</h2>
      <p>5 USDT (WhitePay placeholder) or Stripe test-mode card. Receipt unlocks a one-time download.</p>
      {searchParams.canceled && <p style={{ color: "crimson" }}>Checkout canceled.</p>}
      <form action={startCheckout}>
        <fieldset style={{ padding: 12, border: "1px solid #ddd", borderRadius: 6 }}>
          <legend>Choose a payment provider</legend>
          <label style={{ display: "block", marginBottom: 8 }}>
            <input type="radio" name="provider" value="whitepay" defaultChecked /> WhitePay (USDT, placeholder)
          </label>
          <label style={{ display: "block", marginBottom: 8 }}>
            <input type="radio" name="provider" value="stripe" /> Stripe (card, test mode)
          </label>
          <button type="submit" style={{ padding: "10px 16px", background: "#111", color: "#fff", border: 0, borderRadius: 6 }}>
            Continue
          </button>
        </fieldset>
      </form>
    </main>
  );
}
