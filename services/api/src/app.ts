import { mintApiKey } from './auth.js';
import {
  merchantProfile,
  renameMerchant,
  listProducts,
  renameProduct,
  listPrices,
  listOrders,
  listKeys,
  revokeKey,
  webhookView,
  saveWebhook,
  testWebhook,
} from './admin.js';
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { createHash } from 'node:crypto';
import { z, ZodError } from 'zod';
import { authenticate } from './auth.js';
import { getDb, transaction, migrationReadiness } from './db.js';
import {
  createSession,
  getSession,
  listPaymentsForMerchant,
  getPaymentForMerchant,
  getPaymentForSession,
  HttpError,
} from './sessions.js';
import {
  buildOrderForSession,
  recordSignatures,
  getSubmissionForMerchant,
} from './orders.js';
import {
  createProduct,
  getProduct,
  createPrice,
  getPrice,
} from './merchants.js';
import {
  text,
  address,
  priceSchema,
  sessionSchema,
  signatureSchema,
} from './validation.js';
async function readJson(req: IncomingMessage) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 16384) throw new HttpError(413, 'body_too_large');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'invalid_json');
  }
}
function send(res: ServerResponse, status: number, body?: unknown) {
  res.writeHead(status, {
    'content-type': 'application/json',
    'cache-control': 'no-store',
  });
  res.end(body === undefined ? undefined : JSON.stringify(body));
}
function applyCors(req: IncomingMessage, res: ServerResponse): boolean {
  const origin = req.headers.origin;
  if (!origin) return true;
  const allowed = (process.env.WHITEPAY_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (!allowed.includes(origin)) return false;
  res.setHeader('access-control-allow-origin', origin);
  res.setHeader('vary', 'Origin');
  res.setHeader(
    'access-control-allow-methods',
    'GET,POST,PATCH,DELETE,OPTIONS',
  );
  res.setHeader(
    'access-control-allow-headers',
    'authorization,content-type,idempotency-key',
  );
  res.setHeader('access-control-max-age', '600');
  return true;
}
export function createApp() {
  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost'),
        path = url.pathname,
        method = req.method;
      const originAllowed = applyCors(req, res);
      if (method === 'OPTIONS')
        return originAllowed
          ? send(res, 204)
          : send(res, 403, { error: 'cors_origin_denied' });
      if (!originAllowed)
        return send(res, 403, { error: 'cors_origin_denied' });
      if (path === '/health' && method === 'GET')
        return send(res, 200, { ok: true, service: 'api' });
      if (path === '/ready' && method === 'GET') {
        try {
          const db = getDb();
          await db.query('SELECT 1');
          const migrations = await migrationReadiness();
          return send(res, migrations.current ? 200 : 503, {
            ok: migrations.current,
            service: 'api',
            checks: {
              database: 'up',
              migrations: migrations.appliedCount,
              schema: migrations.current ? 'current' : 'mismatch',
            },
          });
        } catch {
          return send(res, 503, {
            ok: false,
            service: 'api',
            checks: { database: 'down' },
          });
        }
      }
      const merchantId = await authenticate(req.headers.authorization);
      if (!merchantId) return send(res, 401, { error: 'unauthorized' });
      const body =
        method === 'POST' || method === 'PATCH'
          ? await readJson(req)
          : undefined;
      if (path === '/v1/merchant') {
        if (method === 'GET')
          return send(res, 200, await merchantProfile(merchantId));
        if (method === 'PATCH') {
          const b = z.object({ name: text }).strict().parse(body);
          return send(res, 200, await renameMerchant(merchantId, b.name));
        }
      }
      const lists = {
        '/v1/products': listProducts,
        '/v1/prices': listPrices,
        '/v1/checkout/sessions': listOrders,
        '/v1/api-keys': listKeys,
      };
      if (method === 'GET' && path in lists)
        return send(res, 200, {
          data: await lists[path as keyof typeof lists](merchantId),
        });
      if (method === 'POST' && path === '/v1/api-keys') {
        const b = z
          .object({ expiresAt: z.number().int().positive().optional() })
          .strict()
          .parse(body);
        if (b.expiresAt !== undefined && b.expiresAt <= Date.now())
          throw new HttpError(400, 'invalid_request');
        return send(res, 201, await mintApiKey(merchantId, b.expiresAt));
      }
      const revoke = /^\/v1\/api-keys\/([\w-]+)\/revoke$/.exec(path);
      if (method === 'POST' && revoke) {
        z.object({}).strict().parse(body);
        await revokeKey(revoke[1], merchantId);
        return send(res, 204);
      }
      if (path === '/v1/webhook-endpoints') {
        if (method === 'GET')
          return send(res, 200, await webhookView(merchantId));
        if (method === 'POST') {
          const b = z
            .object({
              url: z.string().url().max(2048),
              rotateSecret: z.boolean().optional(),
            })
            .strict()
            .parse(body);
          return send(
            res,
            200,
            await saveWebhook(merchantId, b.url, b.rotateSecret),
          );
        }
      }
      if (method === 'POST' && path === '/v1/webhook-endpoints/test') {
        z.object({}).strict().parse(body);
        return send(res, 200, await testWebhook(merchantId));
      }
      const editProduct = /^\/v1\/products\/([\w-]+)$/.exec(path);
      if (method === 'PATCH' && editProduct) {
        const b = z.object({ name: text }).strict().parse(body);
        return send(
          res,
          200,
          await renameProduct(editProduct[1], merchantId, b.name),
        );
      }
      if (method === 'POST' && path === '/v1/products') {
        const b = z.object({ name: text }).strict().parse(body);
        return send(res, 201, await createProduct(merchantId, b.name));
      }
      if (method === 'POST' && path === '/v1/prices') {
        const b = priceSchema.required({ productId: true }).parse(body);
        return send(res, 201, await createPrice({ ...b, merchantId }));
      }
      const resource =
        /^\/v1\/(products|prices|payments|submissions)\/([\w-]+)$/.exec(path);
      if (resource && method === 'GET') {
        const fn = {
          products: getProduct,
          prices: getPrice,
          payments: getPaymentForMerchant,
          submissions: getSubmissionForMerchant,
        }[resource[1] as 'products'];
        const out = await fn(resource[2], merchantId);
        if (!out) throw new HttpError(404, 'not_found');
        return send(res, 200, out);
      }
      if (method === 'GET' && path === '/v1/payments')
        return send(res, 200, {
          data: await listPaymentsForMerchant(merchantId),
        });
      if (method === 'POST' && path === '/v1/checkout/sessions') {
        const b = sessionSchema.parse(body);
        const key = req.headers['idempotency-key'];
        if (key === undefined)
          return send(res, 200, await createSession({ ...b, merchantId }));
        if (typeof key !== 'string' || key.length < 1 || key.length > 200)
          throw new HttpError(400, 'invalid_idempotency_key');
        const hash = createHash('sha256')
          .update(
            JSON.stringify([
              path,
              b.priceId,
              b.externalOrderId,
              b.successUrl ?? null,
              b.customerReference ?? null,
            ]),
          )
          .digest('hex');
        const out = await transaction(async (c) => {
          await c.query(
            'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
            [JSON.stringify(['idem', merchantId, key])],
          );
          const old = (
            await c.query(
              'SELECT * FROM idempotency_keys WHERE merchant_id=$1 AND key=$2',
              [merchantId, key],
            )
          ).rows[0];
          if (old) {
            if (old.request_hash !== hash)
              throw new HttpError(409, 'idempotency_conflict');
            return old.response_body;
          }
          const session = await createSession({ ...b, merchantId }, c);
          await c.query(
            'INSERT INTO idempotency_keys VALUES($1,$2,$3,$4,200,$5)',
            [key, merchantId, hash, JSON.stringify(session), Date.now()],
          );
          return session;
        });
        return send(res, 200, out);
      }
      const sessionRoute =
        /^\/v1\/checkout\/sessions\/([\w-]+)(?:\/(order|renew|payment))?$/.exec(
          path,
        );
      if (sessionRoute) {
        const [, sessionId, action] = sessionRoute;
        if (method === 'GET' && !action) {
          const s = await getSession(sessionId, merchantId);
          if (!s) throw new HttpError(404, 'not_found');
          return send(res, 200, s);
        }
        if (method === 'GET' && action === 'payment') {
          if (!(await getSession(sessionId, merchantId)))
            throw new HttpError(404, 'not_found');
          return send(res, 200, {
            payment: await getPaymentForSession(sessionId, merchantId),
          });
        }
        if (method === 'POST' && (action === 'order' || action === 'renew')) {
          const b = z.object({ payerAddress: address }).strict().parse(body);
          return send(
            res,
            200,
            await buildOrderForSession({
              sessionId,
              merchantId,
              payerAddress: b.payerAddress,
              renew: action === 'renew',
            }),
          );
        }
      }
      const signatures = /^\/v1\/submissions\/([\w-]+)\/signatures$/.exec(path);
      if (method === 'POST' && signatures) {
        const b = signatureSchema.parse(body);
        const out = await recordSignatures({
          ...b,
          merchantId,
          submissionId: signatures[1],
        });
        if (!out.ok)
          throw new HttpError(
            out.reason === 'not_found' ? 404 : 409,
            out.reason ?? 'bad_request',
          );
        return send(res, 204);
      }
      send(res, 404, { error: 'not_found' });
    } catch (e) {
      if (e instanceof ZodError)
        return send(res, 400, { error: 'invalid_request' });
      if (e instanceof HttpError) return send(res, e.status, { error: e.code }); // Never log request payloads, credentials, signatures or database URLs.
      send(res, 500, { error: 'internal' });
    }
  });
}
