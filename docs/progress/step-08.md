# Step 08 — Node SDK

Local implementation and independent package checks complete. Package remains an unpublished `0.1.0-alpha.0`; no registry, Git or hosted-service publication performed.

Nine regressions initially failed: an implicit unverified API destination, missing session retrieval/product/price/list methods, timeout ending before the body was read, redirects, reflected upstream error text, stale/future webhook timestamps, malformed signatures/payloads and rejected customer references. Implemented explicit API configuration, complete typed merchant methods, safe typed errors, full-response deadlines, redirect rejection, constant-time strict HMAC and freshness/envelope/payment-event schema validation. The server-only constructor rejects browser execution. No automatic request retry can duplicate a non-idempotent operation.

API migration 004 adds customer references without modifying prior migration checksums. Session creation/retrieval and idempotency/conflict checks bind the reference; existing sessions retain null. PostgreSQL payment block/time fields are returned as the numeric types declared by the API/SDK rather than driver bigint strings. Price-create and price-retrieve types reflect their distinct actual responses.

A real tarball was installed offline in a separate temporary Node app with no runtime workspace dependencies. That app called the actual API over localhost, created/retrieved a session, preserved customerReference, replayed creation idempotently, listed payments, verified a webhook and compiled TypeScript against packaged declarations (including negative input type checks). Result: `INDEPENDENT_TARBALL_API_AND_WEBHOOK_CHECK_PASSED`; no keys or signatures printed, no registry publication. Temporary consumer and isolated test schema were removed.

SDK tests, plus API/worker/relayer regressions, pass. Operator database migration 004 has not been applied merely to run SDK tests: these used isolated schemas. Hosted-service configuration, published packages and the React signing flow remain subsequent milestones. The tested Node README documents local tarball installation, explicit configuration, errors, exact USDT minor units, idempotency and fulfillment deduplication.

Step 09 added the customer-authorized server bridge and authenticated per-session payment retrieval. The Node suite now includes 23 passing tests; the packaged independent-consumer runtime/type check was repeated after these additions.
