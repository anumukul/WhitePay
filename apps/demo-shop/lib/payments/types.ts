export type ProviderId = "stripe" | "whitepay";

export interface CreateCheckoutInput {
  orderId: string;
  priceId: string;
  customerEmail?: string;
  successUrl: string;
  cancelUrl: string;
}

export interface CreateCheckoutResult {
  redirectUrl: string;
  providerSessionId: string;
}

export interface VerifyWebhookInput {
  payload: string | Buffer;
  signature: string;
}

export interface NormalizedPaymentEvent {
  orderId: string;
  providerPaymentId: string;
  eventId: string;
}

export interface PaymentProvider {
  readonly id: ProviderId;
  createCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutResult>;
  verifyWebhook(input: VerifyWebhookInput): Promise<NormalizedPaymentEvent>;
}
