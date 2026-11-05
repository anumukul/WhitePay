import type { PaymentProvider, ProviderId } from "./types.js";

const registry = new Map<ProviderId, () => PaymentProvider>();

export function registerProvider(id: ProviderId, factory: () => PaymentProvider): void {
  registry.set(id, factory);
}

export function getProvider(id: ProviderId): PaymentProvider {
  const factory = registry.get(id);
  if (!factory) throw new Error(`Unknown payment provider: ${id}`);
  return factory();
}
