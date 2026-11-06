# @whitepay/react

React 18+ checkout widget, `0.1.0-alpha.0`. Whitechain Sepolia only (1874), exact official six-decimal USDT and the deployed final WhitePay checkout. Not yet published. Build and pack locally with `pnpm --filter @whitepay/react build` and `pnpm --filter @whitepay/react pack --pack-destination /tmp`.

```tsx
import { WhitePayCheckout } from '@whitepay/react';

export function BuyCredits({ sessionId }: { sessionId: string }) {
  return (
    <WhitePayCheckout
      sessionId={sessionId}
      onComplete={({ paymentId }) =>
        console.info('Confirmed payment:', paymentId)
      }
      onError={() => console.info('Checkout needs attention')}
    />
  );
}
```

Create the session on your merchant server with `@whitepay/node`; the frontend receives only its ID. The widget calls your same-origin `/api/whitepay` server bridge. Configure the Node SDK's `createCheckoutBridge` on your server with your authenticated customer's session-ownership check. Never put a merchant API key or webhook secret in React props, client environment variables or a bundle. `publishableKey` is an optional reserved compatibility prop; it does not authenticate customers or merchants. Customer authorization comes from the required server callback, not from possession of a session ID.

The bridge's Node HTTP configuration is:

```ts
import { WhitePay, createCheckoutBridge } from '@whitepay/node';

const whitepay = new WhitePay({
  secretKey: process.env.WHITEPAY_SECRET_KEY!,
  apiBaseUrl: process.env.WHITEPAY_API_URL!,
});
const checkoutHandler = createCheckoutBridge({
  whitepay,
  origin: process.env.MERCHANT_APP_ORIGIN!,
  checkoutAddress: '0x4d1761ABB4eD290F23fcDA00890039800E2e53f0',
  feeRecipient: process.env.WHITEPAY_FEE_RECIPIENT!,
  feeBasisPoints: 10,
  authorizeSession: async (request, sessionId) => {
    // Your own authenticated customer and persisted customer/order mapping:
    const customer = await authenticateCustomer(request);
    return (
      customer !== null && (await customerOwnsSession(customer.id, sessionId))
    );
  },
});
```

`authenticateCustomer` and `customerOwnsSession` are application-specific functions you must implement; there is no allow-all default. Mount the returned handler on `/api/whitepay/*` in a Node HTTP server or adapt its request/response types to your framework. POST requests require the configured exact Origin and JSON; the bridge binds submissions to the authorized session and omits merchant secrets/customer metadata from browser responses. It does not enable wildcard CORS.

The widget first connects the injected wallet and prepares a quote. It independently checks the full EIP712 domains/schemas, payer, merchant, official token, deployed checkout, amount, fee, fee recipient, token authorization total/receiver/nonce and 15-minute window. The review shows exact price, sponsorship fee and total. A separate click requests the two typed-data authorizations. It rechecks wallet identity and the two-minute cutoff before/after signing, verifies both signatures, then submits them to your backend. It requests no transaction, allowance or native-token approval. WBT gas is paid by the separately funded relayer. Native WBT need not be present in the payer wallet.

The widget polls server-confirmed settlement and only then fires `onComplete({paymentId,txHash})`. A queued authorization or transaction hash alone cannot trigger it. Merchant fulfillment must use verified, deduplicated server webhooks; this callback is for UI only. With the current operator policy, relay execution waits for separate transaction approval. Signing does not automatically spend or broadcast.

Missing wallet, wrong chain, declined signatures, altered quotes, changed accounts, insufficient USDT and expired quotes fail safely. A chain switch or quote refresh requires a user click. There is no automatic network switch. This remaining wallet/chain interaction is a documented UX limitation.

For other merchant routing use the exported `CheckoutBackend` interface or `createCheckoutClient('/your/same-origin/path')` via the `backend` prop. `provider` accepts an EIP1193-compatible wallet. `appearance` customizes the review button label/style.

```sh
pnpm --filter @whitepay/react test
pnpm --filter @whitepay/react typecheck
# Existing isolated local PostgreSQL test database, local Chrome on macOS:
TEST_DATABASE_URL=postgresql://whitepay_test@127.0.0.1:55432/whitepay_step05 \
  pnpm --filter @whitepay/react test:browser
```

The browser suite packs this SDK and installs it offline into a separate temporary React app. It uses the real local API and worker, an unfunded ephemeral signer and a simulated confirmed receipt. It does not use your wallets or broadcast. Successful browser tests therefore do not replace the separately approved live official-USDT acceptance test.
