# @whitepay/react

React checkout widget for WhitePay. Peer-depends on React ≥18.

## Usage

```tsx
import { WhitePayCheckout } from "@whitepay/react";

export function BuyCredits({ sessionId }: { sessionId: string }) {
  return (
    <WhitePayCheckout
      publishableKey={process.env.NEXT_PUBLIC_WHITEPAY_KEY!}
      sessionId={sessionId}
      onComplete={({ paymentId }) => console.info("Payment:", paymentId)}
      onError={(err) => console.error(err)}
    />
  );
}
```

The `sessionId` **must come from the server**: call `whitepay.checkout.createSession` with `@whitepay/node` on the merchant backend, return `session.id` to the browser. The quote (price, fee, total, chain) is read from the session on the hosted checkout page — the browser cannot change it.

## Props

| Prop | Type | Notes |
|---|---|---|
| `publishableKey` | `string` (required) | Public merchant identifier. Safe to include in a browser bundle. |
| `sessionId` | `string` (required) | Server-created session id. Starts with `cs_`. |
| `onComplete` | `({ paymentId }) => void` | Fired by the hosted checkout page via postMessage/redirect; **UX only**. Trust the merchant backend's verified webhook, not this callback, to grant entitlements. |
| `onError` | `(err: Error) => void` | Called on local errors (invalid props, navigation failures). |
| `appearance` | `{ label?, buttonStyle? }` | Light styling override. |

## What this widget is NOT

- It does not sign the token authorization itself — that happens on the hosted checkout page where wallet UX lives.
- It does not trust `onComplete` as proof of payment. Real entitlement grants must come from the merchant's webhook handler verifying a WhitePay signature.
- It does not accept `WHITEPAY_SECRET_KEY`. If a backend accidentally bundles it to the client, the module throws on load.
