import { stripeAdapter } from "./stripe-adapter.js";
import { whitepayAdapter } from "./whitepay-adapter.js";
import type { PaymentProvider, ProviderId } from "./types.js";

const providers: Record<ProviderId, PaymentProvider> = {
  stripe: stripeAdapter,
  whitepay: whitepayAdapter,
};

export function getProvider(id: ProviderId): PaymentProvider {
  const p = providers[id];
  if (!p) throw new Error(`Unknown provider: ${id}`);
  return p;
}
export type { ProviderId };
