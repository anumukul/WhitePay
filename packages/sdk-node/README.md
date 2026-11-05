# @whitepay/node

Server-side SDK for WhitePay. Node.js only — **never import in the browser** (the constructor refuses to run there).

## Install (once published)

```bash
pnpm add @whitepay/node
```

## Create a checkout session

```ts
import { WhitePay } from "@whitepay/node";

const whitepay = new WhitePay({ secretKey: process.env.WHITEPAY_SECRET_KEY! });

const session = await whitepay.checkout.createSession({
  priceId: "price_credits_100",
  externalOrderId: "order_123",
});
return Response.json({ redirectUrl: session.redirectUrl });
```

Optional idempotency:

```ts
await whitepay.checkout.createSession({ ... }, { idempotencyKey: "cart_42" });
```

## Verify a webhook

```ts
const event = whitepay.webhooks.verify({
  payload: rawBody,                                   // raw string/Buffer; do NOT JSON.parse first
  signature: headers["x-whitepay-signature"]!,
  timestamp: headers["x-whitepay-timestamp"]!,
  secret: process.env.WHITEPAY_WEBHOOK_SECRET!,
});
if (event.type === "payment.succeeded") {
  await grantEntitlementOnce(event.data.orderId as string); // use a unique DB constraint
}
```

Verification uses HMAC-SHA256 over `timestamp.payload` and constant-time comparison.

## Retrieve a payment

```ts
const payment = await whitepay.payments.retrieve("pay_xxx");
```

## Errors

Every HTTP failure throws `WhitePayAPIError` with `.status` (HTTP code), `.code` (short machine code), and `.message`.

## What this SDK does NOT do

- It does not sign or submit transactions. The signing happens in the browser widget (`@whitepay/react`); the relaying happens in the WhitePay backend.
- It never reads `WHITEPAY_SECRET_KEY` from a browser bundle. If you import it client-side you will get an immediate runtime error, by design.
