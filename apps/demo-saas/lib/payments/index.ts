import { getProvider as getRegistered, registerProvider } from "./registry.js";
import { stripeAdapter } from "./stripe-adapter.js";
import { whitepayAdapter } from "./whitepay-adapter.js";
import type { ProviderId } from "./types.js";

registerProvider("stripe", () => stripeAdapter);
registerProvider("whitepay", () => whitepayAdapter);

export function getProvider(id: ProviderId) {
  return getRegistered(id);
}
export type { ProviderId };
