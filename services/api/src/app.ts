import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { authenticate } from "./auth.js";
import { getDb } from "./db.js";
import { createSession, getSession, listPaymentsForMerchant, getPaymentForMerchant, HttpError } from "./sessions.js";
import { buildOrderForSession, recordSignatures, getSubmissionForMerchant } from "./orders.js";

type Handler = (req: IncomingMessage, res: ServerResponse, ctx: Ctx) => Promise<void> | void;
interface Ctx {
  merchantId: string;
  body: unknown;
  url: URL;
  idempotencyKey?: string;
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return undefined;
  try { return JSON.parse(raw); } catch { throw new HttpError(400, "invalid_json"); }
}

function send(res: ServerResponse, status: number, body: unknown): void {
  const payload = typeof body === "string" ? body : JSON.stringify(body);
  res.writeHead(status, { "content-type": typeof body === "string" ? "text/plain" : "application/json" });
  res.end(payload);
}

function withIdempotency(ctx: Ctx, handler: () => { status: number; body: unknown }): { status: number; body: unknown } {
  if (!ctx.idempotencyKey) return handler();
  const db = getDb();
  const cached = db
    .prepare("SELECT response_body as body, response_status as status FROM idempotency_keys WHERE merchant_id = ? AND key = ?")
    .get(ctx.merchantId, ctx.idempotencyKey) as { body: string; status: number } | undefined;
  if (cached) return { status: cached.status, body: JSON.parse(cached.body) };
  const result = handler();
  db.prepare(
    "INSERT INTO idempotency_keys (key, merchant_id, response_body, response_status, created_at) VALUES (?, ?, ?, ?, ?)",
  ).run(ctx.idempotencyKey, ctx.merchantId, JSON.stringify(result.body), result.status, Date.now());
  return result;
}

const routes: Record<string, Record<string, Handler>> = {
  "POST /v1/checkout/sessions": async (_req, res, ctx) => {
    const b = ctx.body as { priceId?: string; externalOrderId?: string; successUrl?: string };
    if (!b?.priceId || !b?.externalOrderId) throw new HttpError(400, "missing_fields");
    const out = withIdempotency(ctx, () => {
      const session = createSession({
        merchantId: ctx.merchantId,
        priceId: b.priceId!,
        externalOrderId: b.externalOrderId!,
        successUrl: b.successUrl,
      });
      return { status: 200, body: session };
    });
    send(res, out.status, out.body);
  },
  "GET /v1/checkout/sessions": (_req, res, ctx) => {
    const id = ctx.url.pathname.split("/").pop()!;
    const s = getSession(id, ctx.merchantId);
    if (!s) throw new HttpError(404, "not_found");
    send(res, 200, s);
  },
  "GET /v1/payments": (_req, res, ctx) => {
    send(res, 200, { data: listPaymentsForMerchant(ctx.merchantId) });
  },
  "GET /v1/payments/:id": (_req, res, ctx) => {
    const id = ctx.url.pathname.split("/").pop()!;
    const p = getPaymentForMerchant(id, ctx.merchantId);
    if (!p) throw new HttpError(404, "not_found");
    send(res, 200, p);
  },
  "POST /v1/checkout/sessions/:id/order": async (_req, res, ctx) => {
    // path: /v1/checkout/sessions/<sessionId>/order
    const parts = ctx.url.pathname.split("/");
    const sessionId = parts[parts.length - 2];
    const b = ctx.body as { payerAddress?: string };
    if (!b?.payerAddress) throw new HttpError(400, "missing_payer_address");
    const result = buildOrderForSession({
      sessionId,
      merchantId: ctx.merchantId,
      payerAddress: b.payerAddress,
    });
    send(res, 200, result);
  },
  "POST /v1/submissions/:id/signatures": async (_req, res, ctx) => {
    const parts = ctx.url.pathname.split("/");
    const submissionId = parts[parts.length - 2];
    const b = ctx.body as { orderSignature?: string; tokenSignature?: string };
    if (!b?.orderSignature || !b?.tokenSignature) throw new HttpError(400, "missing_signatures");
    const result = recordSignatures({
      submissionId,
      merchantId: ctx.merchantId,
      orderSignature: b.orderSignature,
      tokenSignature: b.tokenSignature,
    });
    if (!result.ok) {
      if (result.reason === "not_found") throw new HttpError(404, "not_found");
      if (result.reason === "already_signed") throw new HttpError(409, "already_signed");
      throw new HttpError(400, "bad_request");
    }
    res.writeHead(204);
    res.end();
  },
  "GET /v1/submissions/:id": (_req, res, ctx) => {
    const id = ctx.url.pathname.split("/").pop()!;
    const row = getSubmissionForMerchant(id, ctx.merchantId);
    if (!row) throw new HttpError(404, "not_found");
    send(res, 200, row);
  },
};

function matchRoute(method: string, pathname: string): Handler | null {
  const direct = routes[`${method} ${pathname}`];
  if (direct) return direct;
  // param routes: strip trailing id segment
  const parts = pathname.split("/");
  if (parts.length < 2) return null;
  const last = parts.pop()!;
  const prefix = parts.join("/");
  if (method === "GET" && prefix === "/v1/checkout/sessions" && last.startsWith("cs_")) {
    return routes["GET /v1/checkout/sessions"];
  }
  if (method === "GET" && prefix === "/v1/payments" && last.startsWith("pay_")) {
    return routes["GET /v1/payments/:id"];
  }
  if (method === "GET" && prefix === "/v1/submissions" && last.startsWith("sub_")) {
    return routes["GET /v1/submissions/:id"];
  }
  // Two-segment param routes: /v1/<x>/<id>/<action>
  if (parts.length >= 2) {
    const action = last;
    const idSegment = parts.pop()!;
    const parentPrefix = parts.join("/");
    if (
      method === "POST" &&
      parentPrefix === "/v1/checkout/sessions" &&
      idSegment.startsWith("cs_") &&
      action === "order"
    ) {
      return routes["POST /v1/checkout/sessions/:id/order"];
    }
    if (
      method === "POST" &&
      parentPrefix === "/v1/submissions" &&
      idSegment.startsWith("sub_") &&
      action === "signatures"
    ) {
      return routes["POST /v1/submissions/:id/signatures"];
    }
  }
  return null;
}

export function createApp() {
  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
      if (url.pathname === "/health") return send(res, 200, { ok: true });

      const merchantId = authenticate(req.headers.authorization);
      if (!merchantId) return send(res, 401, { error: "unauthorized" });

      const handler = matchRoute(req.method ?? "GET", url.pathname);
      if (!handler) return send(res, 404, { error: "not_found" });

      const body = req.method === "POST" ? await readJson(req) : undefined;
      const idempotencyKey = (req.headers["idempotency-key"] as string | undefined)?.trim() || undefined;

      await handler(req, res, { merchantId, body, url, idempotencyKey });
    } catch (e: unknown) {
      if (e instanceof HttpError) return send(res, e.status, { error: e.code, message: e.message });
      console.error(e);
      send(res, 500, { error: "internal" });
    }
  });
}
