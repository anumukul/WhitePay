# Step 09 — private widget acceptance

Local SDK tests and the independent React tarball browser suite do not spend funds. See the package README for merchant integration.

Prepare a fresh public preview, retaining the selected 1 USDT + .001 USDT fee / 15-minute window / 120-second cutoff:

```sh
DATABASE_URL=postgresql://whitepay_test@127.0.0.1:55432/whitepay_step05 \
  pnpm --filter @whitepay/react step09:live prepare
```

Review the exact two displayed digests, official token, chain 1874, receiver, recipients, amount and expiry. This command neither signs nor broadcasts. The ignored owner-only context contains public typed data, not keys/signatures. If it expires, refresh the preview and obtain fresh approval rather than silently extending the window.

Only after explicit approval of these exact payer authorizations, launch in your own private terminal:

```sh
DATABASE_URL=postgresql://whitepay_test@127.0.0.1:55432/whitepay_step05 \
  pnpm --filter @whitepay/react step09:live serve CONTEXT_FILE ORDER_DIGEST TOKEN_DIGEST
```

Open the printed localhost URL. Click Review payment, verify 1 USDT price + .001 fee = 1.001 total, official token, merchant and network, then click Authorize. Enter the existing payer keystore password only at the hidden terminal prompts, never in the browser or chat. The keystore remains encrypted on disk and is never imported into the browser. Only its public address and resulting exact approved authorizations reach the widget.

Return only `STEP09_WIDGET_PAYER_SIGNATURES_VERIFIED_QUEUED` public output. No payment transaction is broadcast by this page. Keep the page/terminal open for confirmation; Ctrl-C closes local servers and revokes the temporary API key. A new simulation and separate exact transaction approval are required before relayer execution. Use the reviewed relayer CLI with this context to obtain that preview; never auto-broadcast or reuse approval for a changed payload.

After the approved transaction is mined, read-only reconciliation and worker indexing must show exactly one payment, exact 1/.001 USDT splits, zero residual, payer WBT exactly zero, both replay rejections and one widget completion. The local proof worker reads the actual confirmed event; it must not fake settlement. Hosted external webhook delivery and independent merchant entitlement tests remain later steps.
