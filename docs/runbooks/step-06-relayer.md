# Step 06 — Manual relayer validation

This milestone is ready for local manual testing. The daemon is preview-only. No new Whitechain transaction is approved. Explorer source verification remains pending from Step 04; Step 07 fulfillment/indexer integration has not started.

## 1. Prepare local prerequisites

From repository root:

```bash
pnpm install --frozen-lockfile --ignore-scripts
bash scripts/vendor-oz.sh
pnpm build:checkout
export PATH="/opt/homebrew/opt/postgresql@15/bin:$PATH"
pnpm db:local
export DATABASE_URL=postgresql://whitepay_test@127.0.0.1:55432/whitepay_step05
export TEST_DATABASE_URL="$DATABASE_URL"
pnpm --filter @whitepay/api migrate
```

Migration 002 adds relay_attempts; migration 001 is unchanged. Existing merchants/sessions survive the upgrade. Tests create/drop their own schemas, not your manual merchant data. Keep the old worker stopped until Step 07 replaces its SQLite adapter.

## 2. Run tests

```bash
pnpm --filter @whitepay/relayer test
pnpm --filter @whitepay/api test
pnpm --filter @whitepay/chain test
pnpm --filter @whitepay/api --filter @whitepay/relayer --filter @whitepay/chain typecheck
pnpm test
```

Expect 43 relayer tests, 38 API tests, 14 local Anvil chain tests, typechecks passing and 29 root tests. Relayer tests use real PostgreSQL, real ephemeral test signatures and controlled fake-chain receipts, plus one actual local Anvil EVM rejection test. No test connects to Whitechain or signs with your real keystores. The Anvil test deploys only on its ephemeral local chain, checks failed settlement simulation, and verifies the relayer never signs/sends. A separate Node process tests restart recovery from PostgreSQL without access to the original signer.

## 3. Walk through the interactive local demo

```bash
pnpm --filter @whitepay/relayer demo:local
```

Press Enter when prompted and inspect each stage:

1. **Preview:** unsigned hash, gas 180000 and reserve 3600000000001000 wei are shown. No signer or broadcast called. These are synthetic test costs, not a live quote.
2. **Tampering:** amount changed to 1 minor unit is rejected against the session price. Broadcast count stays zero.
3. **Timeout:** exact nonce and signed bytes/hash are persisted before the fake broadcaster throws an ambiguous timeout. Ledger remains pending with budget reserved.
4. **Recovery:** same signed bytes reused; signer called once, fake broadcast attempts twice, one unique transaction. No new nonce, fee, amount or expiry invented.
5. **Receipt:** synthetic exact event/transfers reconcile; reserved_wei becomes zero, charged_wei becomes 600000000000123, attempt mined. API stays submitted because Step 07 owns settlement indexing/fulfillment.

This demo uses only an isolated PostgreSQL schema and an in-memory fake chain. It creates ephemeral synthetic signing accounts internally, never prints keys/signatures/raw transactions, and removes its test schema on exit. `--auto` is available for noninteractive verification.

For selected failure scenarios:

```bash
pnpm --filter @whitepay/relayer exec node --test --import tsx/esm --test-name-pattern='ambiguous|different Node process|expired|nonce|fee|quarantined' test/loop.integration.test.ts test/loop.test.ts
```

Inspect tests showing: expired ambiguous transactions retain reservations; unsent expired reservations release safely; mined/unconfirmed known hashes wait; unknown consumed nonce quarantines; malformed durable signed bytes never resend; wrong merchant amount/missing event cannot fulfill; wrong nonce from a signer rejects; actual signed-byte L1 quote is rechecked before broadcast.

## 4. Optional real-network read-only preview daemon

This reads the PostgreSQL queue and trusted RPC. It cannot sign or broadcast and does not modify queued submissions in preview mode.

```bash
export WHITECHAIN_RPC_URL=https://rpc.testnet.whitechain.io
export WHITEPAY_CHECKOUT_CONTRACT_ADDRESS=0x4d1761ABB4eD290F23fcDA00890039800E2e53f0
export WHITEPAY_FEE_RECIPIENT=0x2F51C76D37BA9118ce8D5b9377329965ddb411c2
export WHITEPAY_FEE_BASIS_POINTS=10
export WHITEPAY_QUOTE_VALIDITY_SECONDS=900
export RELAYER_PUBLIC_ADDRESS=0xba780C2e4e79e4109EC53b52fCE9982f33962A92
export RELAYER_EXECUTION_MODE=preview
pnpm --filter @whitepay/relayer dev
```

If no signed queued submission exists, it stays idle. Synthetic merchant fixtures generally cannot simulate on the real official token because their payer addresses have no official USDT. That is expected and must not broadcast. Do not sign old test quotes or import private keys merely to populate this queue. A new live payment needs a fresh API order, signing preview and explicit signing approval, then exact transaction approval.

The real RPC adapter checks pinned final checkout runtime before simulation and requires chain 1874. It retrieves L1 cost from Whitechain's gas oracle, waits two confirmations and checks canonical block hash; missing L1 receipt fee fails closed. Only public relayer address is needed. RELAYER_PRIVATE_KEY is no longer supported by the daemon. Execution mode is rejected at startup; library execution uses an operator-injected secure signer plus a matching per-transaction approval object.

## 5. Manual acceptance and later live gate

Return results of the tests and interactive demo. No real payment is needed for this local gate. Do not commit/push or start Step 07 until reviewed.

A controlled Whitechain proof through the new relayer engine remains separately gated: fresh session/quote and payer signatures, explicit transaction preview (digest, recipient, nonce, value, gas, max fee, priority, L1 reserve and expiry), exact approval, secure private-terminal signer injection, confirmed receipt and balance/replay evidence. The earlier Step 04 live payment proved the contract, not this new PostgreSQL relayer engine.

Fee bounds: L2 gas/max fee/priority are encoded in the signed transaction; budget reservation uses the approved gas limit times max fee plus an L1 margin. L1 fee is not protocol-capped. Oracle checks on unsigned and actual signed bytes can reject a send, but later L1 changes may exceed the reservation; actual receipt debit is recorded and then constrains further spending. Budget is per relayer and UTC reservation day. Day rollover, unknown nonce consumption, changed limits or ambiguous expired sends require review; no automatic new nonce, replacement transaction, cancellation or fee bump.

## Completing the controlled live proof (separate approvals)

The live operator is now implemented. Policy selection alone does not approve signing or a transaction. Do not reuse the old Step 04 launchers or consumed order.

Safe preflight command (public RPC reads, local migration/metadata only):

```bash
pnpm --filter @whitepay/relayer step06:live preflight
```

Workflow, with exact context and hashes supplied only after each preview is reviewed:

1. `step06:live prepare` creates a fresh local API session/quote for the user-selected 1+0.001-USDT proof and prints only public context/digests/expiry/balances. No signing or transaction. It must not be used to silently renew approved terms.
2. User reviews the exact signing preview and gives payer signing approval. `sign-payer CONTEXT ORDER_DIGEST` then runs only in the user's terminal, checks both digests and signs the matching typed data with the existing encrypted payer keystore. It saves signatures with 0600 permissions in the ignored 0700 authorization directory and verifies the payer before API queue admission. Passwords are entered only at hidden Cast prompts.
3. `preview CONTEXT` independently simulates the real selected queue entry and prints nonce, gas, max fee, priority, L1 quote/reserve, hashes and expected balances. It also runs the dedicated invalid-request proof with signing/broadcasting disabled. No real transaction.
4. User gives a separate exact transaction approval. `execute CONTEXT UNSIGNED_HASH` uses the existing encrypted relayer keystore and hash-only offline Cast signing, checks sender/payload, persists exact signed bytes before send, and broadcasts only the selected approved transaction. No default key or password environment variable is accepted.
5. `reconcile CONTEXT` checks confirmed receipts and updates accounting without any signer or resend; `verify CONTEXT` verifies actual balances/debit and both replay rejection paths through read-only calls. Only public summaries are returned.
6. Record live evidence and user manual acceptance. Step remains incomplete until those checks pass. Do not commit/push or start Step 07 early.

All commands take their context path explicitly; there is no automatic "latest" quote selection, nonce replacement, fee bump or expiry renewal. Existing pending attempts block unrelated proof execution rather than being acted on silently. Source verification of the final checkout remains unresolved due to the explorer service.

### Diagnosing a signing stop safely

`step06:live check-signing CONTEXT` verifies the public file, policy, expected database row/digests, local-clock validity and available private terminal without signing or needing RPC access. Actual signing additionally repeats all chain/token/balance/time checks. Use the explicit DATABASE_URL from the proof command; a missing row in a different database is reported separately. `test:terminal` reproduces the private-terminal/piped-stdout scenario with only a temporary test double and in-memory signer. Password prompts use the verified private terminal; stdout contains public summaries only.

SIGNING_WINDOW_CLOSED means stop: do not rerun the expired signing command. A replacement quote needs its own preview and fresh approval. Do not disable the user-selected two-minute cutoff.
