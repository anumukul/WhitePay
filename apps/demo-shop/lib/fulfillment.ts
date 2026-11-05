import { grantDownloadOnce } from "./db/entitlements.js";
import { recordWebhookOnce } from "./db/webhook-events.js";
import type { NormalizedPaymentEvent } from "./payments/types.js";

export function fulfill(source: "stripe" | "whitepay", event: NormalizedPaymentEvent) {
  const dedup = recordWebhookOnce({ eventId: event.eventId, source, orderId: event.orderId });
  if (!dedup.fresh) return { duplicate: true, granted: false };
  const res = grantDownloadOnce({
    orderId: event.orderId,
    provider: source,
    providerPaymentId: event.providerPaymentId,
  });
  return { duplicate: false, granted: res.granted, downloadToken: res.downloadToken };
}
