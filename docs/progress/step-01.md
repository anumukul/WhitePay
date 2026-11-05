# Step 01 — Official USDT capability investigation

STEP: 01 — Official token authorization investigation

STATUS: READY_FOR_HUMAN_TEST

## Scope completed

Implemented a read-only RPC/explorer probe with a fixed-block snapshot, chain/code checks, EIP-1967 lookup, verified implementation ABI/runtime inspection, exact metadata decoding, domain/typehash verification, and valid/invalid signature simulations. Added fail-closed transport tests and recorded an ADR proposal.

## Files added/changed

- `scripts/probe-token.mjs`, `scripts/lib/token-probe.mjs`: reusable read-only investigation.
- `tests/token-probe.test.mjs`: chain/code safety, malformed/empty results, broadcast rejection, transport failures, domain regression.
- `package.json`, `pnpm-lock.yaml`: `probe:token` and exact viem 2.38.5 as a development dependency for ABI/signature primitives.
- `docs/evidence/token-probe.json`, `docs/evidence/token-compatibility.md`: live snapshot and limitations.
- `docs/decisions/0001-authorization-path.md`: proposed Path A.
- README, architecture, limitations, feedback, progress state: current status and reproducibility.

## TDD proof

Initial `node --test tests/token-probe.test.mjs` exited 1 because the probe module did not exist. Implemented the helpers; safety tests passed. The first live run then failed on incorrect viem domain-hash invocation, without any external state change. Added a domain regression test (4 pass / 1 fail when helper was absent), supplied explicit EIP712Domain field types, and reran successfully. Final local suite: **9 passed / 0 failed**. Final live probe: **25 checks passed / 15 call expectations passed**, exit 0.

## Commands actually run

- `node --test tests/token-probe.test.mjs`: initial expected RED exit 1; regression RED exit 1; GREEN exit 0.
- `pnpm add -Dw viem@2.38.5`: exit 0. Exact version saved.
- `pnpm probe:token docs/evidence/token-probe.json`: first live run exit 1 (domain helper bug), sandbox-only rerun exit 1 (network unavailable), final network-enabled run exit 0. No failures hidden.
- `pnpm test`: exit 0, 9/9 tests; includes shared build.
- `pnpm typecheck`: exit 0.
- `pnpm install --frozen-lockfile --offline`: exit 1 (store context required module-directory removal and non-TTY refused); subsequent network-enabled `pnpm install --frozen-lockfile` exited 0 with lockfile unchanged.
- Official documentation and explorer read-only fetches: successful after network escalation. Browser fetch could not access these URLs; CLI fetched official endpoints.

Final `pnpm lint`, `pnpm typecheck`, `pnpm test` (9/9), `pnpm build`, and `git diff --check` exited 0. A targeted credential/private-key assignment scan returned no matches (rg exit 1); gitleaks was not installed, so no comprehensive gitleaks scan is claimed. Diff stat before staging: 7 tracked files, 192 insertions / 19 deletions; added probe/test/evidence/ADR/report files were still untracked. The staged commit summary includes all additions.

## Security and testnet evidence

Official token is a proxy. Verified implementation runtime matches RPC. Both permit and EIP-3009 signatures pass simulations; recipient-only EIP-3009 check works. Only disposable in-memory accounts were signed. A strict RPC allowlist forbids broadcasts and unlock calls. No real keys, hosted mutations, transaction submissions, faucet claims, npm publication, or deployments.

DEPLOYED URLS: NOT DEPLOYED. Mined payment receipt/replay: NOT VERIFIED. Step 02 requires official-USDT funding and separately approved writes. Second teammate security review remains required before live contract execution.

## Manual test script

1. `pnpm install --frozen-lockfile` — should succeed with the pinned lockfile.
2. `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` — all should exit 0; expect nine unit tests.
3. `pnpm probe:token docs/evidence/token-probe-manual.json` — requires public network access, no credentials. Expect READ_ONLY_CAPABILITIES_VERIFIED, six token decimals, 25 successful checks, exit 0.
4. Inspect the reported implementation on the official explorer and compare runtime hash, token domain, and recipient-only source requirement.
5. Review the proposed ADR. Confirm the zero-value simulation limitations and that no transaction hash is presented as payment evidence.

## Human gate and Git authorization

Human acceptance and ADR approval are PENDING. Per the user's standing instruction to commit and push code while working, Step 01 code/evidence may be uploaded to the existing `origin/main` for review; that upload does not infer manual acceptance or authorize Step 02. No core contract ABI has been changed.

HUMAN DECISION REQUIRED: approve Step 01 evidence and the proposed authorization path, or report `FAIL STEP 01: <symptom>`.

NEXT STEP: 02 — genuine zero-WBT proof. DO NOT BEGIN automatically.
