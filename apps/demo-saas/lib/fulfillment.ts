import { grantEntitlementOnce } from "./db/entitlements.js";
import { recordWebhookOnce } from "./db/webhook-events.js";
import type { NormalizedPaymentEvent } from "./payments/types.js";

export const CREDITS_PER_ORDER = 100;

export function fulfill(source: "stripe" | "whitepay", event: NormalizedPaymentEvent) {
  const dedup = recordWebhookOnce({
    eventId: event.eventId,
    source,
    orderId: event.orderId,
  });
  if (!dedup.fresh) return { duplicate: true, granted: false };
  const result = grantEntitlementOnce({
    orderId: event.orderId,
    provider: source,
    providerPaymentId: event.providerPaymentId,
    credits: CREDITS_PER_ORDER,
  });
  return { duplicate: false, granted: result.granted };
}
