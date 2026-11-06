// DEV-ONLY TRIGGER: simulates the on-chain settlement event that the real worker
// (services/worker) will deliver once the contract is deployed on Whitechain Sepolia.
// Gated by env NODE_ENV !== 'production' so it can't ship to production.
import { NextResponse } from "next/server";
import { createHmac, randomUUID } from "node:crypto";

interface WhitePayEvent {
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

function signPayload(secret: string, timestamp: string, payload: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
}

export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return new NextResponse("stub disabled in production", { status: 410 });
  }
  const body = await req.json();
  const { orderId, sessionId, forwardTo } = body;
  const event: WhitePayEvent = {
    id: `evt_${randomUUID()}`,
    type: "payment.succeeded",
    data: {
      orderId,
      paymentId: `stub_pay_${sessionId}`,
      sessionId,
      amountMinor: "5000000",
      currency: "USDT",
      chainId: Number(process.env.WHITECHAIN_CHAIN_ID ?? 1874),
    },
  };
  const payload = JSON.stringify(event);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const secret = process.env.WHITEPAY_WEBHOOK_SECRET ?? "whsec_stub";
  const signature = signPayload(secret, timestamp, payload);

  if (forwardTo) {
    const base = process.env.APP_BASE_URL ?? "http://localhost:3000";
    await fetch(`${base}${forwardTo}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-whitepay-timestamp": timestamp,
        "x-whitepay-signature": signature,
      },
      body: payload,
    });
  }
  return NextResponse.json({ event, signature, timestamp });
}
