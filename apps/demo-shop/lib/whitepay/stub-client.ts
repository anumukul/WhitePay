// SWAP-POINT: replace with @whitepay/node once Step 08 lands
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

export interface WhitePayConfig {
  secretKey: string;
  apiBaseUrl?: string;
}

export interface CreateSessionInput {
  priceId: string;
  externalOrderId: string;
  customerReference?: string;
  successUrl?: string;
  cancelUrl?: string;
}

export interface CreateSessionResult {
  sessionId: string;
  redirectUrl: string;
  priceId: string;
  externalOrderId: string;
}

export interface WhitePayEvent {
  id: string;
  type: "payment.succeeded";
  data: {
    orderId: string;
    paymentId: string;
    sessionId: string;
    amountMinor: string;
    currency: "USDT";
    chainId: number;
  };
}

const sessions = new Map<string, CreateSessionResult>();

export class WhitePay {
  constructor(private readonly config: WhitePayConfig) {
    if (!config.secretKey) throw new Error("WhitePay: secretKey required");
  }

  readonly checkout = {
    createSession: async (input: CreateSessionInput): Promise<CreateSessionResult> => {
      const base = this.config.apiBaseUrl ?? "http://localhost:3100";
      const sessionId = `stub_cs_shop_${randomUUID().replace(/-/g, "").slice(0, 20)}`;
      const redirectUrl = `${base}/_stub/whitepay/pay/${sessionId}`;
      const result: CreateSessionResult = {
        sessionId,
        redirectUrl,
        priceId: input.priceId,
        externalOrderId: input.externalOrderId,
      };
      sessions.set(sessionId, result);
      return result;
    },
  };

  readonly payments = {
    retrieve: async (id: string) => {
      const s = sessions.get(id);
      return { id: `stub_pay_${id}`, sessionId: id, externalOrderId: s?.externalOrderId ?? "unknown", status: "succeeded" as const };
    },
  };

  readonly webhooks = {
    verify: ({ payload, signature, timestamp, secret }: {
      payload: string | Buffer; signature: string; timestamp: string; secret: string;
    }): WhitePayEvent => {
      const raw = typeof payload === "string" ? payload : payload.toString("utf8");
      const expected = signPayload(secret, timestamp, raw);
      const given = Buffer.from(signature, "hex");
      const want = Buffer.from(expected, "hex");
      if (given.length !== want.length || !timingSafeEqual(given, want)) {
        throw new Error("WhitePay webhook signature mismatch");
      }
      const parsed = JSON.parse(raw) as WhitePayEvent;
      if (parsed.type !== "payment.succeeded") throw new Error("Unexpected event type");
      return parsed;
    },
  };
}

export function signPayload(secret: string, timestamp: string, payload: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
}
