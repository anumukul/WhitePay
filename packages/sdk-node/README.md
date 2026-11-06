# @whitepay/node

WhitePay's server-side SDK, version `0.1.0-alpha.0`. Testnet only; not published to a registry. Install a locally built tarball or use the workspace package. Requires Node 20 or later. Never import this package into a browser bundle; it uses Node crypto and rejects browser execution. Merchant secret keys belong exclusively on your server.

```sh
pnpm --filter @whitepay/node build
pnpm --filter @whitepay/node pack --pack-destination /tmp
# In an independent Node application:
npm install /tmp/whitepay-node-0.1.0-alpha.0.tgz
```

Configure the API URL explicitly. There is no default hosted API. HTTPS is required except for local development.

```ts
import { WhitePay } from '@whitepay/node';

const whitepay = new WhitePay({
  secretKey: process.env.WHITEPAY_SECRET_KEY!,
  apiBaseUrl: process.env.WHITEPAY_API_URL!,
  timeoutMs: 15_000,
});
const session = await whitepay.checkout.createSession(
  {
    priceId: 'price_from_your_api',
    externalOrderId: 'your_unique_order_id',
    customerReference: 'your_customer_id',
  },
  { idempotencyKey: 'your_unique_creation_key' },
);
const refreshed = await whitepay.checkout.retrieve(session.id);
```

Use the server-created `redirectUrl` for navigation. Product creation is `products.create({name})`; price creation is `prices.create({productId, amountMinor, currency: 'USDT', tokenAddress})`. Use exactly `0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7` and six-decimal integer minor units: 1 USDT = 1,000,000. Price creation returns `{id, version}`; `prices.retrieve(id)` returns its full immutable terms. Products, payments and prices have `retrieve(id)` methods; `payments.list()` returns `{data}`. Checkout quote/signature/submission methods support a merchant backend's browser bridge; they do not sign or broadcast.

Verify webhook bytes before parsing, using the exact request body:

```ts
import { verifyWebhook } from '@whitepay/node';

const event = verifyWebhook({
  payload: rawBody,
  signature: headers['x-whitepay-signature'],
  timestamp: headers['x-whitepay-timestamp'],
  secret: process.env.WHITEPAY_WEBHOOK_SECRET!,
});
```

Verification checks strict HMAC-SHA256, timestamp freshness (300 seconds), event envelope and the official-USDT `payment.succeeded` schema. `whitepay.webhooks.verify` is equivalent. Persist `event.id` as a unique key in the same database transaction as fulfillment. Duplicate delivery must not grant credits twice. A browser callback does not authorize fulfillment.

HTTP and transport failures throw `WhitePayAPIError` with `.status` and `.code`. Transport failures have status 0 and code `timeout` or `network_error`; malformed successful bodies use `invalid_response`. The timeout includes reading the response body. Errors never include arbitrary upstream response text. Redirects are rejected before forwarding credentials. No automatic retries are made: retry session creation with the same external order and idempotency key after an ambiguous timeout; changing terms with that key produces 409. Never automatically retry a spending operation.

```sh
# Existing local PostgreSQL test database:
TEST_DATABASE_URL=postgresql://whitepay_test@127.0.0.1:55432/whitepay_step05 \
  pnpm --filter @whitepay/node test
TEST_DATABASE_URL=postgresql://whitepay_test@127.0.0.1:55432/whitepay_step05 \
  pnpm --filter @whitepay/node test:package
```

The package check installs the actual tarball offline into a temporary independent app, creates/retrieves an actual API session, checks idempotency and webhook verification, and compiles consumer TypeScript against packaged declarations. It does not publish anything or send a chain transaction.

For React integration, `createCheckoutBridge` mounts a same-origin customer-authorized bridge. It requires your own customer/session ownership callback, exact origin and public checkout/fee settings. See `packages/sdk-react/README.md`; never expose this merchant SDK or its secret key in a browser. `checkout.payment(sessionId)` reads the authoritative indexed payment for one merchant-owned session.
