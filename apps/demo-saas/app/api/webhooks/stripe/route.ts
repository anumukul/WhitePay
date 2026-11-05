import { NextResponse } from "next/server";
import { stripeAdapter, UnhandledEventError } from "@/lib/payments/stripe-adapter";
import { fulfill } from "@/lib/fulfillment";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const signature = req.headers.get("stripe-signature");
  if (!signature) return new NextResponse("missing signature", { status: 400 });
  const raw = await req.text();
  try {
    const event = await stripeAdapter.verifyWebhook({ payload: raw, signature });
    fulfill("stripe", event);
    return NextResponse.json({ received: true });
  } catch (e: unknown) {
    if (e instanceof UnhandledEventError) return NextResponse.json({ ignored: e.eventType });
    const msg = e instanceof Error ? e.message : String(e);
    return new NextResponse(`invalid: ${msg}`, { status: 400 });
  }
}
