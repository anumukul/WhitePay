import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { createHash } from 'node:crypto';
import { z, ZodError } from 'zod';
import { authenticate } from './auth.js';
import { transaction } from './db.js';
import {
  createSession,
  getSession,
  listPaymentsForMerchant,
  getPaymentForMerchant,
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
export function createApp() {
  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost'),
        path = url.pathname,
        method = req.method;
      if (path === '/health' && method === 'GET')
        return send(res, 200, { ok: true });
      const merchantId = await authenticate(req.headers.authorization);
      if (!merchantId) return send(res, 401, { error: 'unauthorized' });
      const body = method === 'POST' ? await readJson(req) : undefined;
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
        /^\/v1\/checkout\/sessions\/([\w-]+)(?:\/(order|renew))?$/.exec(path);
      if (sessionRoute) {
        const [, sessionId, action] = sessionRoute;
        if (method === 'GET' && !action) {
          const s = await getSession(sessionId, merchantId);
          if (!s) throw new HttpError(404, 'not_found');
          return send(res, 200, s);
        }
        if (method === 'POST' && action) {
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
