// SWAP-POINT: replace with real WhitePay API /checkout/sessions once services/api lands
import { NextResponse } from "next/server";
import { WhitePay } from "@/lib/whitepay/stub-client";

export async function POST(req: Request) {
  const body = await req.json();
  const client = new WhitePay({
    secretKey: process.env.WHITEPAY_SECRET_KEY ?? "stub",
    apiBaseUrl: process.env.APP_BASE_URL ?? "http://localhost:3000",
  });
  const session = await client.checkout.createSession({
    priceId: body.priceId,
    externalOrderId: body.externalOrderId,
    successUrl: body.successUrl,
    cancelUrl: body.cancelUrl,
  });
  return NextResponse.json(session);
}
