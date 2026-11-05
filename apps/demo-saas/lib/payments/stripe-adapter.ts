import Stripe from "stripe";
import type {
  CreateCheckoutInput,
  CreateCheckoutResult,
  NormalizedPaymentEvent,
  PaymentProvider,
  VerifyWebhookInput,
} from "./types.js";

const API_VERSION: Stripe.LatestApiVersion = "2024-10-28.acacia";

function client(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY not set");
  return new Stripe(key, { apiVersion: API_VERSION });
}

export const stripeAdapter: PaymentProvider = {
  id: "stripe",

  async createCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutResult> {
    const stripe = client();
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price: input.priceId, quantity: 1 }],
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      customer_email: input.customerEmail,
      metadata: { orderId: input.orderId },
    });
    if (!session.url) throw new Error("Stripe did not return a session URL");
    return { redirectUrl: session.url, providerSessionId: session.id };
  },

  async verifyWebhook({ payload, signature }: VerifyWebhookInput): Promise<NormalizedPaymentEvent> {
    const stripe = client();
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET not set");
    const event = stripe.webhooks.constructEvent(payload, signature, secret);

    if (
      event.type !== "checkout.session.completed" &&
      event.type !== "checkout.session.async_payment_succeeded"
    ) {
      throw new UnhandledEventError(event.type, event.id);
    }
    const session = event.data.object as Stripe.Checkout.Session;
    const orderId = session.metadata?.orderId;
    if (!orderId) throw new Error(`Stripe event ${event.id} missing orderId metadata`);
    return {
      eventId: event.id,
      orderId,
      providerPaymentId: typeof session.payment_intent === "string"
        ? session.payment_intent
        : session.payment_intent?.id ?? session.id,
    };
  },
};

export class UnhandledEventError extends Error {
  constructor(public readonly eventType: string, public readonly eventId: string) {
    super(`Unhandled Stripe event: ${eventType}`);
    this.name = "UnhandledEventError";
  }
}
