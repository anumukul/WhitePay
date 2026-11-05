# Step 02 wallet-config regression fix

STEP: 02 — Wallet public-address export repair

STATUS: READY_FOR_HUMAN_TEST — user completed private-terminal export/config; all five public addresses and actual RPC balances reviewed. Live proof remains blocked on funding and approvals.

## Exact root cause

Inspected the five local keystores without printing their contents. Each is version 3, permission 0600, and has only the top-level fields `crypto`, `id`, and `version`. All five omit `address`. This is not an unprefixed address problem: the original helper already added `0x` to 40-digit metadata. It assumed optional keystore address metadata always existed, and converted an absent value into `0x`, which validation rejected.

No key, password, encrypted payload, KDF parameters, or full keystore JSON was printed. No keystore was modified. Public addresses cannot be inferred from encrypted ciphertext without decryption; the assistant must not guess or request the passwords.

## Changes

- `scripts/poc/wallet-metadata.mjs`: explicit 20-byte hex normalization accepting 0x-prefixed/unprefixed values (also 0X), EIP-55 output, zero/malformed/missing rejection; optional separately derived address for keystores without metadata; mismatch rejection when both sources exist; strict public-only manifest with chainId 1874 and normalized duplicate checks.
- `scripts/poc/export-wallet-addresses.mjs`: user-terminal-only `cast wallet address --keystore` exporter. Passwords remain in Cast's hidden local prompts. Only bounded public-address stdout is captured; malformed stdout is never echoed. Saves a public-only manifest, checks all five distinct roles, and refuses inconsistent existing manifests. No wallet creation or signing/broadcast method.
- `scripts/poc/wallet-config.mjs`: consumes the public manifest when required, keeps encrypted files untouched and owner-only, refuses malformed/mismatched/duplicate values before writing any config, and prints configured chainId 1874 plus public roles only.
- `tests/poc-wallets.test.mjs`, `tests/poc-wallet-config.test.mjs`: normalization, actual missing-metadata structure, fallback/mismatch, duplicate/invalid/missing manifests, no partial output, no encrypted-content echo, overwrite refusal, and noninteractive prompt refusal. Test opaque sentinels are synthetic, never real key material.
- Package script `poc:wallet-addresses` and wallet runbook updated.

## TDD evidence and actual checks

1. Reproduced `pnpm poc:wallet-config`: exit 1 with original reported error.
2. Added four regression cases before implementation. RED: 2 existing tests passed / 4 new tests failed. Failures were missing-metadata fallback, missing normalizer, missing mismatch rejection, and missing manifest validation.
3. Implemented fixes. GREEN: 6 wallet-metadata tests passed.
4. Added three end-to-end safety tests using synthetic temporary files matching the actual Foundry field layout. Tests verify all five exported addresses equal the supplied normalized public values; config/stdout contain no opaque encrypted fixture payload or KDF fields; invalid/duplicate/missing values fail before writing; exporter refuses password prompts in noninteractive execution.
5. `pnpm test`: 23 passed, 0 failed, exit 0. `pnpm typecheck`, `pnpm lint`, exporter syntax check and `git diff --check`: exit 0.
6. Reran real `pnpm poc:wallet-config`: safe exit 1 with the instruction to run public-address export, because no manifest exists yet.
7. Reran initial preflight: BLOCKED/exit 1 because public config cannot be generated until addresses are exported. Saved `docs/evidence/poc-before-funding.json`; this is a blocked attempt, not a successful balance snapshot. No user-wallet RPC queries or balance confirmation claimed.

## User action needed for real verification

In the user's private terminal (no secrets in chat):

```sh
pnpm poc:wallet-addresses
```

This re-derives all five public addresses with Cast and verifies 5/5. After it succeeds, the assistant can run:

```sh
pnpm poc:wallet-config
pnpm poc:preflight docs/evidence/poc-config.json docs/evidence/poc-before-funding.json
```

Expected config: only public roles, chainId 1874 and payment/gas settings. Initial preflight may correctly remain BLOCKED on missing funds, while still displaying actual public balances and the RPC chain ID. Never interpret configured chainId alone as an RPC verification.

## Restrictions and review gate

No wallets created, no contract deployment, no message/transaction signing, no broadcasting, no commit/push, and no Step 03. User reported successful password/public-address recovery already; the assistant has not independently recovered or compared the five real addresses yet. That check requires the local exporter or the user's already-derived public outputs. No placeholder addresses were substituted into real configuration.

Actual onchain payment proof remains unverified. Stop for manual review after the real public-address export/config/preflight evidence is available.

## User-completed export and actual evidence review

User confirmed exporter, wallet-config and initial preflight succeeded. Compared all five addresses across normalized public manifest, validated config, and initial RPC evidence: 5/5 matched, with chainId 1874 and no duplicates. No keystore was reopened or unlocked by the assistant.

Ran `pnpm poc:preflight docs/evidence/poc-config.json docs/evidence/poc-wallet-review.json` with read-only RPC access. At block 12307110, all five addresses had WBT=0 and official USDT=0, none blocklisted, none with code. Payer zero-WBT condition passed; payer token sufficiency failed as expected before funding. Only three expected funding blockers were returned, exit 1. Token proxy/runtime/domain and six decimals matched the Step 01 baseline.

Configured L2 fee budgets: deployer 0.04 WBT and relayer 0.01 WBT at their respective gas ceilings and maxFeePerGas=20 gwei, excluding variable L1 data fees. Suggested operational funding: 0.10 WBT each; payer request 10 exact official USDT (minimum 5.005). Merchant and fee recipient need no funding. Actual transactions and any deployer-to-relayer top-up remain explicitly unapproved.

No code change or new tests needed for this evidence review. No deployment, broadcast, commit/push, or Step 03. Stop for user-directed funding and manual approval.
