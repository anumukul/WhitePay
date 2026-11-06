# Step 14 — npm publish + docs site (PREPARED, EXTERNAL-WRITE GATE)

External-write gate. Tarballs built and tested locally; `npm publish` has NOT run.

## Packages ready to publish

| Package | Version | Tarball | Verified |
|---|---|---|---|
| `@whitepay/node` | `0.1.0-alpha.0` | `packages/sdk-node/whitepay-node-0.1.0-alpha.0.tgz` | 6 tests green, pnpm pack successful |
| `@whitepay/react` | `0.1.0-alpha.0` | `packages/sdk-react/whitepay-react-0.1.0-alpha.0.tgz` | 5 tests green, pnpm pack successful |

## Pre-publish checklist (operator)

1. Confirm both packages are **available on the npm registry** (`npm view @whitepay/node` — expect "not found"; if someone claimed the name, STOP and choose alternative).
2. Confirm licence: `MIT` in both package.json. Add `LICENSE` file at repo root before publish.
3. Install the tarball in a clean app:
   ```bash
   cd /tmp && mkdir freshtest && cd freshtest
   npm init -y && npm install .../packages/sdk-node/whitepay-node-0.1.0-alpha.0.tgz
   node -e 'import("@whitepay/node").then(m => console.log(Object.keys(m)))'
   # expect: ["WhitePay", "WhitePayAPIError"]
   ```
4. Same for @whitepay/react in a React 18 project.
5. Browser-leak check: bundle the node SDK into an esbuild browser target; expect a runtime refusal (the constructor throws if `typeof window !== 'undefined'`).

## Publish (requires "approve publish")

```bash
cd packages/sdk-node && npm publish --access public --tag alpha
cd packages/sdk-react && npm publish --access public --tag alpha
```

Use `--tag alpha` so it does not become the default-install. Bump to `0.1.0` + `latest` only after Step 16 adversarial regression signs off.

## Docs site

For the hackathon submission a single `docs/` markdown tree hosted on GitHub Pages is sufficient. Full docusaurus/vite-docs site is Tier 2 per PR.md 20.

Quickstart snippet (copy-paste tested):

```ts
// 1. Install
// pnpm add @whitepay/node

// 2. Server: create a session
import { WhitePay } from "@whitepay/node";
const wp = new WhitePay({ secretKey: process.env.WHITEPAY_SECRET_KEY! });
const session = await wp.checkout.createSession({
  priceId: "price_credits_100",
  externalOrderId: "order_123",
});

// 3. Server: verify webhook
const event = wp.webhooks.verify({
  payload: rawBody,
  signature: request.headers["x-whitepay-signature"]!,
  timestamp: request.headers["x-whitepay-timestamp"]!,
  secret: process.env.WHITEPAY_WEBHOOK_SECRET!,
});
if (event.type === "payment.succeeded") await grantOnce(event.data.orderId);
```

## STOP — awaiting "approve publish"
