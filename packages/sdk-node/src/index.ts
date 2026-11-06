import { createHmac, timingSafeEqual } from "node:crypto";

export interface WhitePayConfig {
  secretKey: string;
  apiBaseUrl?: string;
  timeoutMs?: number;
}

export interface CreateSessionInput {
  priceId: string;
  externalOrderId: string;
  customerReference?: string;
  successUrl?: string;
}

export interface CheckoutSession {
  id: string;
  redirectUrl: string;
  externalOrderId: string;
  priceId: string;
  status: "open" | "settled" | "canceled";
  amountMinor: number;
  currency: string;
  tokenAddress: string;
}

export interface Payment {
  id: string;
  sessionId: string;
  status: string;
  amountMinor: number;
  txHash: string | null;
  blockNumber: number | null;
  createdAt: number;
}

export interface VerifyWebhookInput {
  payload: string | Buffer;
  signature: string;
  timestamp: string;
  secret: string;
}

export interface VerifiedEvent {
  type: string;
  id: string;
  data: Record<string, unknown>;
}

export class WhitePayAPIError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "WhitePayAPIError";
  }
}

export class WhitePay {
  readonly checkout: CheckoutAPI;
  readonly payments: PaymentsAPI;
  readonly webhooks: WebhooksAPI;

  constructor(private readonly config: WhitePayConfig) {
    if (!config.secretKey) throw new Error("WhitePay: secretKey required");
    if (typeof window !== "undefined") {
      throw new Error("WhitePay secretKey must not be used in the browser");
    }
    const client = new HttpClient(config);
    this.checkout = new CheckoutAPI(client);
    this.payments = new PaymentsAPI(client);
    this.webhooks = new WebhooksAPI();
  }
}

class HttpClient {
  readonly baseUrl: string;
  constructor(private readonly config: WhitePayConfig) {
    this.baseUrl = (config.apiBaseUrl ?? "https://api.whitepay.io").replace(/\/+$/, "");
  }

  async request<T>(method: "GET" | "POST", path: string, body?: unknown, idempotencyKey?: string): Promise<T> {
    const controller = new AbortController();
    const timeout = this.config.timeoutMs ?? 15_000;
    const t = setTimeout(() => controller.abort(), timeout);
    const headers: Record<string, string> = {
      "authorization": `Bearer ${this.config.secretKey}`,
      "accept": "application/json",
    };
    if (body !== undefined) headers["content-type"] = "application/json";
    if (idempotencyKey) headers["idempotency-key"] = idempotencyKey;

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        method, headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(t);
    }

    const text = await res.text();
    let parsed: unknown = undefined;
    if (text) {
      try { parsed = JSON.parse(text); } catch { /* keep text */ }
    }
    if (!res.ok) {
      const err = parsed as { error?: string; message?: string } | undefined;
      throw new WhitePayAPIError(res.status, err?.error ?? "http_error", err?.message ?? text);
    }
    return parsed as T;
  }
}

class CheckoutAPI {
  constructor(private readonly client: HttpClient) {}

  async createSession(input: CreateSessionInput, opts: { idempotencyKey?: string } = {}): Promise<CheckoutSession> {
    return this.client.request<CheckoutSession>("POST", "/v1/checkout/sessions", input, opts.idempotencyKey);
  }
}

class PaymentsAPI {
  constructor(private readonly client: HttpClient) {}

  async retrieve(id: string): Promise<Payment> {
    return this.client.request<Payment>("GET", `/v1/payments/${encodeURIComponent(id)}`);
  }
}

class WebhooksAPI {
  verify(input: VerifyWebhookInput): VerifiedEvent {
    const raw = typeof input.payload === "string" ? input.payload : input.payload.toString("utf8");
    const expected = createHmac("sha256", input.secret).update(`${input.timestamp}.${raw}`).digest("hex");
    const given = Buffer.from(input.signature, "hex");
    const want = Buffer.from(expected, "hex");
    if (given.length !== want.length || !timingSafeEqual(given, want)) {
      throw new WhitePayAPIError(400, "invalid_signature", "WhitePay webhook signature mismatch");
    }
    const parsed = JSON.parse(raw) as VerifiedEvent;
    if (!parsed || typeof parsed.type !== "string" || typeof parsed.id !== "string") {
      throw new WhitePayAPIError(400, "invalid_payload", "WhitePay webhook payload malformed");
    }
    return parsed;
  }
}
