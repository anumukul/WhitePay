import { WhitePay } from "../whitepay/stub-client.js";
import type {
  CreateCheckoutInput, CreateCheckoutResult, NormalizedPaymentEvent, PaymentProvider, VerifyWebhookInput,
} from "./types.js";

// SWAP-POINT: when @whitepay/node ships, change the import to `import { WhitePay } from "@whitepay/node";`

function client(): WhitePay {
  const secretKey = process.env.WHITEPAY_SECRET_KEY;
  if (!secretKey) throw new Error("WHITEPAY_SECRET_KEY not set");
  return new WhitePay({ secretKey, apiBaseUrl: process.env.APP_BASE_URL ?? "http://localhost:3100" });
}

export const whitepayAdapter: PaymentProvider = {
  id: "whitepay",
  async createCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutResult> {
    const wp = client();
    const session = await wp.checkout.createSession({
      priceId: input.priceId,
      externalOrderId: input.orderId,
      successUrl: input.successUrl,
      cancelUrl: input.cancelUrl,
    });
    const url = new URL(session.redirectUrl);
    url.searchParams.set("orderId", input.orderId);
    return { redirectUrl: url.toString(), providerSessionId: session.sessionId };
  },
  async verifyWebhook({ payload, signature }: VerifyWebhookInput): Promise<NormalizedPaymentEvent> {
    const wp = client();
    const secret = process.env.WHITEPAY_WEBHOOK_SECRET;
    if (!secret) throw new Error("WHITEPAY_WEBHOOK_SECRET not set");
    const raw = typeof payload === "string" ? payload : payload.toString("utf8");
    const parts = signature.split(",");
    const timestamp = parts.find((p) => p.startsWith("t="))?.slice(2);
    const sig = parts.find((p) => p.startsWith("v1="))?.slice(3) ?? signature;
    if (!timestamp) throw new Error("WhitePay webhook missing timestamp");
    const event = wp.webhooks.verify({ payload: raw, signature: sig, timestamp, secret });
    return { eventId: event.id, orderId: event.data.orderId, providerPaymentId: event.data.paymentId };
  },
};
