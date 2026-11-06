# Step 10 — merchant dashboard

Local implementation/self-test gate complete. No hosted deployment, external webhook send, commit or push performed.

Added authenticated merchant profile, product/price/order lists, product rename, API-key creation/listing/revocation, webhook settings/explicit secret rotation and signed non-payment test delivery. Existing orders retain immutable price/payout snapshots when new price versions are created. Every resource is scoped to the authenticated merchant. Lists expose masked prefixes and metadata, never stored API-key hashes or existing secrets. Webhook URLs reject unsafe/private destinations; actual test sends additionally require explicit allowed origins and use pinned DNS/address filtering, HTTPS and a total timeout. Concurrent test requests reserve a per-merchant cooldown before sending. Migration 005 stores test-delivery results separately from payment events; no test delivery can fabricate payment success.

Replaced the API key stored directly in a browser cookie with an opaque random dashboard session token. The API credential remains only in server memory; cookie is HttpOnly, SameSite Strict, Secure in production, expires after eight hours, and logout invalidates it. Invalid keys are authenticated before a session is created. No universal admin/login bypass is present. In-memory sessions deliberately require reauthentication after server restart; a shared hosted session store remains part of deployment readiness, not silently claimed as implemented.

Dashboard now has payments with exact USDT formatting/explorer receipt links, orders/status, products with rename/new immutable price versions, merchant name/payout, one-time API-key onboarding and revoke, webhook URL/rotation/test result, and sign-out. New API/webhook secrets are returned only to the authenticated creation action and disappear on reload. Browser tests exposed a redirect-based one-time display defect and a React form-reset race; action-state responses and a controlled URL input fix these without printing credentials or persisting secrets in client cookies/URLs.

## Validation

- Six new API admin tests passed, including tenant isolation, snapshot preservation, masked keys/revocation, unsafe webhook rejection, an actual signed localhost test event and concurrent delivery throttling. Existing API regressions passed with the new versioned migration.
- Six dashboard unit/API/session tests passed; 27 worker tests passed after moving shared destination validation/transport into the API package without a dependency cycle.
- Production Next build and dashboard/API/worker typechecks passed.
- Four Chrome cases passed using two independent merchant cookies: product/order/payment/receipt isolation; create/rename and both price versions; one-time key/webhook secret visibility and key revocation; invalid login/logout. Private URL errors retain the user's input; unapproved external test delivery is blocked.
- Browser payment records were created by the real worker from explicitly controlled test receipts, not direct manual payment-status edits. These dashboard fixtures are not represented as additional live payments. Step 09's actual live payment evidence remains separate.

Limits: API keys currently confer full merchant administration, webhook signing secrets reside in the trusted local PostgreSQL store, and dashboard sessions use process memory. Hosted security/session/key-storage hardening belongs to Step 13/16. CSV export is optional and was not added. No external service or package was published.
