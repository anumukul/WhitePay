import { getDb } from "./index.js";

export function recordWebhookOnce(input: { eventId: string; source: "stripe" | "whitepay"; orderId: string }) {
  const db = getDb();
  try {
    db.prepare(
      `INSERT INTO webhook_events (event_id, source, order_id, received_at) VALUES (?, ?, ?, ?)`,
    ).run(input.eventId, input.source, input.orderId, Date.now());
    return { fresh: true };
  } catch (e: unknown) {
    if (e instanceof Error && /UNIQUE/i.test(e.message)) return { fresh: false };
    throw e;
  }
}
