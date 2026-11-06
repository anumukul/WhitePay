import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto';
import { transaction, getDb } from './db.js';
import { safeWebhookFetch, validateDestination } from './destination.js';
export function signPayload(
  secret: string,
  timestamp: string,
  payload: string,
) {
  return createHmac('sha256', secret)
    .update(`${timestamp}.${payload}`)
    .digest('hex');
}
export function verifySignature(input: {
  secret: string;
  timestamp: string;
  payload: string;
  signature: string;
  nowMs?: number;
  maxAgeSeconds?: number;
}) {
  if (
    !/^\d{1,12}$/.test(input.timestamp) ||
    !/^([a-f0-9]{64})$/i.test(input.signature)
  )
    return false;
  const time = Number(input.timestamp),
    now = Math.floor((input.nowMs ?? Date.now()) / 1000);
  if (
    !Number.isSafeInteger(time) ||
    Math.abs(now - time) > (input.maxAgeSeconds ?? 300)
  )
    return false;
  const expected = Buffer.from(
      signPayload(input.secret, input.timestamp, input.payload),
      'hex',
    ),
    actual = Buffer.from(input.signature, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<{ ok: boolean; status: number }>;
export interface DeliveryConfig {
  allowedOrigins: string[];
  allowLocal?: boolean;
  fetchImpl?: FetchLike;
  nowMs?: number;
  maxAttempts?: number;
  leaseMs?: number;
}
export async function dispatchOnce(cfg: DeliveryConfig) {
  const now = cfg.nowMs ?? Date.now(),
    max = cfg.maxAttempts ?? 5,
    lease = cfg.leaseMs ?? 30000;
  if (
    !Number.isSafeInteger(max) ||
    max < 1 ||
    max > 20 ||
    !Number.isSafeInteger(lease) ||
    lease < 1000 ||
    !cfg.allowedOrigins.length
  )
    throw new Error('invalid_delivery_configuration');
  const token = randomUUID();
  const row = await transaction(async (c) => {
    await c.query(
      "UPDATE webhook_outbox SET state='dead',lease_token=NULL,lease_until=NULL WHERE attempts>=$1 AND (state='pending' OR (state='delivering' AND lease_until<=$2))",
      [max, now],
    );
    const next = (
      await c.query(
        "SELECT * FROM webhook_outbox WHERE attempts<$1 AND ((state='pending' AND next_attempt_at<=$2) OR (state='delivering' AND lease_until<=$2)) ORDER BY next_attempt_at,id FOR UPDATE SKIP LOCKED LIMIT 1",
        [max, now],
      )
    ).rows[0];
    if (!next) return null;
    return (
      await c.query(
        "UPDATE webhook_outbox SET state='delivering',attempts=attempts+1,lease_token=$1,lease_until=$2 WHERE id=$3 RETURNING *",
        [token, now + lease, next.id],
      )
    ).rows[0];
  });
  if (!row) return { processed: 0 };
  const merchant = (
    await getDb().query('SELECT webhook_secret FROM merchants WHERE id=$1', [
      row.merchant_id,
    ])
  ).rows[0];
  let result = { ok: false, status: 0 };
  try {
    validateDestination(row.url, cfg.allowedOrigins, cfg.allowLocal);
    const timestamp = Math.floor(now / 1000).toString();
    const signature = signPayload(
      merchant.webhook_secret,
      timestamp,
      row.payload,
    );
    result = await (
      cfg.fetchImpl ?? safeWebhookFetch(cfg.allowedOrigins, cfg.allowLocal)
    )(row.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-whitepay-event-id': row.event_id,
        'x-whitepay-timestamp': timestamp,
        'x-whitepay-signature': signature,
      },
      body: row.payload,
    });
  } catch {}
  const delivered = result.ok && result.status >= 200 && result.status < 300;
  const state = delivered
    ? 'delivered'
    : row.attempts >= max
      ? 'dead'
      : 'pending';
  const delay = Math.min(60000, 1000 * 2 ** (row.attempts - 1));
  const updated = await getDb().query(
    'UPDATE webhook_outbox SET state=$1,next_attempt_at=$2,lease_token=NULL,lease_until=NULL,last_response_code=$3,delivered_at=$4 WHERE id=$5 AND lease_token=$6',
    [state, now + delay, result.status, delivered ? now : null, row.id, token],
  );
  return {
    processed: 1,
    eventId: row.event_id,
    state: updated.rowCount ? state : 'lease_lost',
    attempts: row.attempts,
    responseStatus: result.status,
  };
}
