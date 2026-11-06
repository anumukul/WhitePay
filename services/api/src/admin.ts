import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { getDb, transaction } from './db.js';
import { HttpError } from './sessions.js';
import { validateDestination, safeWebhookFetch } from './webhook-policy.js';
const localAllowed = () =>
  process.env.NODE_ENV !== 'production' &&
  process.env.WHITEPAY_ALLOW_LOCAL_WEBHOOKS === '1';
export async function merchantProfile(id: string) {
  return (
    await getDb().query(
      'SELECT id,name,payout_address AS "payoutAddress" FROM merchants WHERE id=$1',
      [id],
    )
  ).rows[0];
}
export async function renameMerchant(id: string, name: string) {
  await getDb().query('UPDATE merchants SET name=$1 WHERE id=$2', [name, id]);
  return merchantProfile(id);
}
export async function listProducts(id: string) {
  return (
    await getDb().query(
      'SELECT id,name FROM products WHERE merchant_id=$1 ORDER BY created_at DESC LIMIT 100',
      [id],
    )
  ).rows;
}
export async function renameProduct(
  id: string,
  merchantId: string,
  name: string,
) {
  const r = await getDb().query(
    'UPDATE products SET name=$1 WHERE id=$2 AND merchant_id=$3 RETURNING id,name',
    [name, id, merchantId],
  );
  if (!r.rowCount) throw new HttpError(404, 'not_found');
  return r.rows[0];
}
export async function listPrices(id: string) {
  return (
    await getDb().query(
      'SELECT id,product_id AS "productId",version,amount_minor::float8 AS "amountMinor",currency,token_address AS "tokenAddress" FROM prices WHERE merchant_id=$1 ORDER BY created_at DESC LIMIT 100',
      [id],
    )
  ).rows;
}
export async function listOrders(id: string) {
  return (
    await getDb().query(
      'SELECT id,external_order_id AS "externalOrderId",status,amount_minor::float8 AS "amountMinor",currency,price_id AS "priceId",created_at::float8 AS "createdAt" FROM checkout_sessions WHERE merchant_id=$1 ORDER BY created_at DESC LIMIT 100',
      [id],
    )
  ).rows;
}
export async function listKeys(id: string) {
  return (
    await getDb().query(
      'SELECT id,prefix,created_at::float8 AS "createdAt",expires_at::float8 AS "expiresAt",revoked_at::float8 AS "revokedAt" FROM api_keys WHERE merchant_id=$1 ORDER BY created_at DESC',
      [id],
    )
  ).rows;
}
export async function revokeKey(id: string, merchantId: string) {
  const r = await getDb().query(
    'UPDATE api_keys SET revoked_at=COALESCE(revoked_at,$1) WHERE id=$2 AND merchant_id=$3',
    [Date.now(), id, merchantId],
  );
  if (!r.rowCount) throw new HttpError(404, 'not_found');
}
export async function webhookView(merchantId: string) {
  const merchant = (
    await getDb().query(
      'SELECT webhook_url AS url FROM merchants WHERE id=$1',
      [merchantId],
    )
  ).rows[0];
  const lastTest =
    (
      await getDb().query(
        'SELECT id,response_status AS "responseStatus",created_at::float8 AS "createdAt" FROM webhook_tests WHERE merchant_id=$1 ORDER BY created_at DESC LIMIT 1',
        [merchantId],
      )
    ).rows[0] ?? null;
  return { ...merchant, lastTest };
}
export async function saveWebhook(
  merchantId: string,
  url: string,
  rotateSecret = false,
) {
  try {
    validateDestination(url, [new URL(url).origin], localAllowed());
    const host = new URL(url).hostname.toLowerCase();
    if (
      (host === 'localhost' ||
        host.endsWith('.localhost') ||
        host.endsWith('.local')) &&
      !localAllowed()
    )
      throw new Error();
  } catch {
    throw new HttpError(400, 'invalid_webhook_url');
  }
  return transaction(async (c) => {
    const old = (
      await c.query(
        'SELECT webhook_url,webhook_secret FROM merchants WHERE id=$1 FOR UPDATE',
        [merchantId],
      )
    ).rows[0];
    const reveal = old.webhook_url === null || rotateSecret,
      secret = rotateSecret
        ? 'whsec_' + randomBytes(32).toString('hex')
        : old.webhook_secret;
    await c.query(
      'UPDATE merchants SET webhook_url=$1,webhook_secret=$2 WHERE id=$3',
      [url, secret, merchantId],
    );
    return { url, ...(reveal ? { signingSecret: secret } : {}) };
  });
}
export async function testWebhook(merchantId: string) {
  const merchant = (
    await getDb().query(
      'SELECT webhook_url,webhook_secret FROM merchants WHERE id=$1',
      [merchantId],
    )
  ).rows[0];
  if (!merchant.webhook_url) throw new HttpError(409, 'webhook_not_configured');
  const origins = (process.env.WHITEPAY_WEBHOOK_ALLOWED_ORIGINS ?? '')
    .split(',')
    .filter(Boolean);
  try {
    validateDestination(merchant.webhook_url, origins, localAllowed());
  } catch {
    throw new HttpError(409, 'webhook_origin_not_approved');
  }
  const id = 'evt_test_' + randomUUID(),
    timestamp = String(Math.floor(Date.now() / 1000));
  await transaction(async (c) => {
    await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
      'webhook-test:' + merchantId,
    ]);
    const last = (
      await c.query(
        'SELECT created_at FROM webhook_tests WHERE merchant_id=$1 ORDER BY created_at DESC LIMIT 1',
        [merchantId],
      )
    ).rows[0];
    if (last && Date.now() - Number(last.created_at) < 10000)
      throw new HttpError(429, 'rate_limited');
    await c.query('INSERT INTO webhook_tests VALUES($1,$2,0,$3)', [
      id,
      merchantId,
      Date.now(),
    ]);
  });
  const body = JSON.stringify({
    id,
    type: 'webhook.test',
    data: { merchantId },
  });
  const signature = createHmac('sha256', merchant.webhook_secret)
    .update(timestamp + '.' + body)
    .digest('hex');
  let responseStatus = 0;
  try {
    responseStatus = (
      await safeWebhookFetch(origins, localAllowed())(merchant.webhook_url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-whitepay-event-id': id,
          'x-whitepay-timestamp': timestamp,
          'x-whitepay-signature': signature,
        },
        body,
      })
    ).status;
  } catch {}
  await getDb().query(
    'UPDATE webhook_tests SET response_status=$1 WHERE id=$2',
    [responseStatus, id],
  );
  return {
    id,
    type: 'webhook.test',
    delivered: responseStatus >= 200 && responseStatus < 300,
    responseStatus,
  };
}
