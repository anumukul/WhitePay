import { NextResponse } from "next/server";
import { whitepayAdapter } from "@/lib/payments/whitepay-adapter";
import { fulfill } from "@/lib/fulfillment";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const sig = req.headers.get("x-whitepay-signature");
  const ts = req.headers.get("x-whitepay-timestamp");
  if (!sig || !ts) return new NextResponse("missing signature headers", { status: 400 });
  const raw = await req.text();
  try {
    const event = await whitepayAdapter.verifyWebhook({ payload: raw, signature: `t=${ts},v1=${sig}` });
    fulfill("whitepay", event);
    return NextResponse.json({ received: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return new NextResponse(`invalid: ${msg}`, { status: 400 });
  }
}
