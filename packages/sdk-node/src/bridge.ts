import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import { WhitePayAPIError, type WhitePay } from './index.js';
interface BridgeConfig {
  whitepay: WhitePay;
  origin: string;
  pathPrefix?: string;
  checkoutAddress: string;
  feeRecipient: string;
  feeBasisPoints: number;
}
export interface CheckoutBridgeOptions extends BridgeConfig {
  authorizeSession: (
    request: IncomingMessage,
    sessionId: string,
  ) => boolean | Promise<boolean>;
}
export interface CheckoutFetchBridgeOptions extends BridgeConfig {
  authorizeSession: (
    request: Request,
    sessionId: string,
  ) => boolean | Promise<boolean>;
}
const response = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
    },
  });
function configuration(cfg: BridgeConfig) {
  const origin = new URL(cfg.origin);
  if (
    origin.origin !== cfg.origin ||
    !/^0x[0-9a-fA-F]{40}$/.test(cfg.feeRecipient) ||
    cfg.checkoutAddress.toLowerCase() !==
      '0x4d1761abb4ed290f23fcda00890039800e2e53f0' ||
    !Number.isSafeInteger(cfg.feeBasisPoints) ||
    cfg.feeBasisPoints < 0 ||
    cfg.feeBasisPoints > 10000
  )
    throw new Error('invalid_checkout_bridge_configuration');
  const prefix = cfg.pathPrefix ?? '/api/whitepay';
  if (!/^\/(?!\/)[a-zA-Z0-9/_-]+$/.test(prefix))
    throw new Error('invalid_checkout_bridge_path');
  return prefix;
}
async function json(req: Request) {
  if (!req.body) return null;
  const reader = req.body.getReader(),
    parts: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 16384) {
        await reader.cancel();
        throw new WhitePayAPIError(413, 'body_too_large');
      }
      parts.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    return JSON.parse(Buffer.concat(parts).toString('utf8'));
  } catch {
    throw new WhitePayAPIError(400, 'invalid_json');
  }
}
export function createCheckoutFetchBridge(cfg: CheckoutFetchBridgeOptions) {
  const prefix = configuration(cfg);
  if (typeof cfg.authorizeSession !== 'function')
    throw new Error('customer_authorization_required');
  return async (req: Request): Promise<Response> => {
    try {
      const path = new URL(req.url).pathname;
      if (!path.startsWith(prefix + '/sessions/'))
        return response(404, { error: 'not_found' });
      const match = /^(cs_[a-zA-Z0-9]+)(?:\/(quote|signatures|status))?$/.exec(
        path.slice((prefix + '/sessions/').length),
      );
      if (!match) return response(404, { error: 'not_found' });
      const [, sessionId, action] = match,
        origin = req.headers.get('origin');
      if (origin && origin !== cfg.origin)
        return response(403, { error: 'forbidden' });
      if (!(await cfg.authorizeSession(req, sessionId)))
        return response(404, { error: 'not_found' });
      if (req.method === 'GET' && !action) {
        const s = await cfg.whitepay.checkout.retrieve(sessionId);
        return response(200, {
          id: s.id,
          status: s.status,
          amountMinor: s.amountMinor,
          currency: s.currency,
          tokenAddress: s.tokenAddress,
          payoutAddress: s.payoutAddress,
          chainId: 1874,
          checkoutAddress: cfg.checkoutAddress,
          feeRecipient: cfg.feeRecipient,
          feeBasisPoints: cfg.feeBasisPoints,
          minimumValiditySeconds: 120,
        });
      }
      if (req.method === 'GET' && action === 'status') {
        const [session, payment] = await Promise.all([
          cfg.whitepay.checkout.retrieve(sessionId),
          cfg.whitepay.checkout.payment(sessionId),
        ]);
        return response(200, {
          sessionStatus: session.status,
          payment: payment.payment,
        });
      }
      if (req.method !== 'POST' || !['quote', 'signatures'].includes(action))
        return response(405, { error: 'method_not_allowed' });
      if (origin !== cfg.origin) return response(403, { error: 'forbidden' });
      if (!req.headers.get('content-type')?.startsWith('application/json'))
        return response(415, { error: 'json_required' });
      const b = await json(req);
      if (!b || typeof b !== 'object' || Array.isArray(b))
        return response(400, { error: 'invalid_request' });
      if (action === 'quote') {
        if (
          Object.keys(b).some((k) => !['payerAddress', 'renew'].includes(k)) ||
          typeof b.payerAddress !== 'string' ||
          (b.renew !== undefined && typeof b.renew !== 'boolean')
        )
          return response(400, { error: 'invalid_request' });
        return response(
          200,
          await cfg.whitepay.checkout.quote(
            sessionId,
            { payerAddress: b.payerAddress },
            { renew: b.renew === true },
          ),
        );
      }
      if (
        Object.keys(b).sort().join(',') !==
          'orderSignature,submissionId,tokenSignature' ||
        typeof b.submissionId !== 'string' ||
        !/^0x[0-9a-fA-F]{130}$/.test(b.orderSignature) ||
        !/^0x[0-9a-fA-F]{130}$/.test(b.tokenSignature)
      )
        return response(400, { error: 'invalid_request' });
      const sub = await cfg.whitepay.checkout.submission(b.submissionId);
      if (sub.sessionId !== sessionId)
        return response(404, { error: 'not_found' });
      await cfg.whitepay.checkout.submitSignatures(b.submissionId, {
        orderSignature: b.orderSignature,
        tokenSignature: b.tokenSignature,
      });
      return response(204);
    } catch (e) {
      if (e instanceof WhitePayAPIError && e.status >= 400 && e.status <= 499)
        return response(e.status, { error: e.code });
      return response(500, { error: 'checkout_unavailable' });
    }
  };
}
export function createCheckoutBridge(cfg: CheckoutBridgeOptions) {
  configuration(cfg);
  if (typeof cfg.authorizeSession !== 'function')
    throw new Error('customer_authorization_required');
  return async (req: IncomingMessage, res: ServerResponse) => {
    try {
      const handler = createCheckoutFetchBridge({
        ...cfg,
        authorizeSession: (_request, id) => cfg.authorizeSession(req, id),
      });
      const headers = new Headers();
      for (const [name, value] of Object.entries(req.headers))
        if (value !== undefined)
          headers.set(name, Array.isArray(value) ? value.join(',') : value);
      const init: RequestInit & { duplex?: string } = {
        method: req.method,
        headers,
      };
      if (!['GET', 'HEAD'].includes(req.method ?? 'GET')) {
        init.body = Readable.toWeb(req) as ReadableStream;
        init.duplex = 'half';
      }
      const result = await handler(
        new Request(new URL(req.url ?? '/', cfg.origin), init),
      );
      res.writeHead(result.status, Object.fromEntries(result.headers));
      res.end(Buffer.from(await result.arrayBuffer()));
    } catch {
      res
        .writeHead(500, {
          'content-type': 'application/json',
          'cache-control': 'no-store',
        })
        .end(JSON.stringify({ error: 'checkout_unavailable' }));
    }
  };
}
