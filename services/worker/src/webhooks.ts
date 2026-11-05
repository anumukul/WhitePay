import { createHmac, timingSafeEqual } from "node:crypto";
import { getDb } from "./db.js";

export function signPayload(secret: string, timestamp: string, payload: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
}

export function verifySignature(input: {
  secret: string;
  timestamp: string;
  payload: string;
  signature: string;
}): boolean {
  const expected = signPayload(input.secret, input.timestamp, input.payload);
  const a = Buffer.from(input.signature, "hex");
  const b = Buffer.from(expected, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export interface DeliveryAttempt {
  ok: boolean;
  status: number;
}

export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<DeliveryAttempt>;

export async function deliverWebhook(input: {
  eventId: string;
  url: string;
  secret: string;
  payload: string;
  maxAttempts?: number;
  fetchImpl: FetchLike;
  nowMs?: number;
}): Promise<{ delivered: boolean; attempts: number; lastStatus: number | null }> {
  const db = getDb();
  const max = input.maxAttempts ?? 5;
  const now = input.nowMs ?? Date.now();

  db.prepare(
    `INSERT OR IGNORE INTO webhook_deliveries (event_id, url, status, attempts, last_attempt_at) VALUES (?, ?, 'pending', 0, ?)`,
  ).run(input.eventId, input.url, now);

  const row = db
    .prepare("SELECT attempts, status FROM webhook_deliveries WHERE event_id = ? AND url = ?")
    .get(input.eventId, input.url) as { attempts: number; status: string };
  if (row.status === "delivered") return { delivered: true, attempts: row.attempts, lastStatus: 200 };

  const timestamp = Math.floor(now / 1000).toString();
  const signature = signPayload(input.secret, timestamp, input.payload);
  let attempts = row.attempts;
  let lastStatus: number | null = null;
  while (attempts < max) {
    attempts++;
    let attempt: DeliveryAttempt;
    try {
      attempt = await input.fetchImpl(input.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-whitepay-timestamp": timestamp,
          "x-whitepay-signature": signature,
          "x-whitepay-event-id": input.eventId,
        },
        body: input.payload,
      });
    } catch {
      attempt = { ok: false, status: 0 };
    }
    lastStatus = attempt.status;
    if (attempt.ok) {
      db.prepare(
        "UPDATE webhook_deliveries SET status = 'delivered', attempts = ?, last_response_code = ?, last_attempt_at = ? WHERE event_id = ? AND url = ?",
      ).run(attempts, attempt.status, Date.now(), input.eventId, input.url);
      return { delivered: true, attempts, lastStatus };
    }
  }
  db.prepare(
    "UPDATE webhook_deliveries SET status = 'failed', attempts = ?, last_response_code = ?, last_attempt_at = ? WHERE event_id = ? AND url = ?",
  ).run(attempts, lastStatus, Date.now(), input.eventId, input.url);
  return { delivered: false, attempts, lastStatus };
}
