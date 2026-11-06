# Step 03 — Core checkout contract (TDD, mocks only)

Status: **GREEN on mocks**. No deployment. Security review by a second teammate still required before Step 04.

## Scope

Minimal production `WhitePayCheckout` matching the authorization path approved in ADR 0001 (path A: EIP-3009 `receiveWithAuthorization`, bound to EIP-712 order digest as the token nonce). Settles one payment atomically, splits between merchant and fee recipient, no custody, no escrow, no admin functions beyond the constructor-time allowed-token list.

## Divergence from Step 02 PoC

- `token` is now a **field of the Order struct** (per ADR: "bind … official token … into the canonical order terms"). The PoC hardcoded a single constant token address; production parameterizes.
- Constructor takes an **explicit `expectedChainId`** (stored immutable) and an initial list of allowed tokens. Chain id is still cross-checked against `block.chainid` at both construction and at every `settle` call.
- Allowed-token allowlist with a dedicated `TokenNotAllowed` error (defence-in-depth against rogue tokens with non-conforming `receiveWithAuthorization`).
- EIP-712 domain name changed to `WhitePayCheckout` (v1) so PoC signatures cannot be replayed against the production contract and vice versa.
- Event adds the `quoteId` (merchant-side correlation).

Everything else matches the PoC: digest as nonce, strict `(validAfter, validBefore)` open interval, reentrancy guard, exact pre/post balance accounting (`InexactTokenTransfer` if any invariant breaks).

## Build

The default foundry profile points at the PoC and may fail on Windows/OneDrive due to cross-package relative-path case mismatches (see `scripts/vendor-oz.sh` for the workaround). Step 03 uses its own profile:

```bash
bash scripts/vendor-oz.sh
cd packages/contracts
FOUNDRY_PROFILE=step03 forge build
FOUNDRY_PROFILE=step03 forge test
```

`via_ir = true` is enabled in the step03 profile to avoid stack-too-deep in `settle` (the exact balance accounting block pushes the default pipeline over the limit).

## Tests — RED → GREEN

20 tests, all green. Fuzz: 256 runs on `(amount, fee)` via uint64 inputs.

| Test | Covers |
|---|---|
| `testExactAtomicSplit` | happy path: payer debited exactly `amount+fee`, merchant credited `amount`, fee recipient `fee`, contract 0, nonce consumed, order marked settled |
| `testZeroFeeNoFeeTransfer` | fee=0 skips fee transfer |
| `testReplayRejected` | same `orderId` second time reverts `OrderAlreadySettled` |
| `testMerchantTamperRejected` / `testFeeTamperRejected` / `testAmountTamperRejected` / `testFeeRecipientTamperRejected` / `testTokenTamperRejected` | mutating any economic field after signing → `InvalidOrderSignature` (or `TokenNotAllowed` / revert for token swap) |
| `testExpiredBoundaryRejected` / `testValidAfterBoundaryRejected` | strict open interval `(validAfter, validBefore)` — equal timestamps revert |
| `testWrongRuntimeChainRejected` | `block.chainid != expectedChainId` reverts with `WrongChain` |
| `testCrossContractSignatureRejected` | signature valid for deployment A does not verify under deployment B (EIP-712 domain binding) |
| `testWrongSignerRejected` | signed by an address that is not `order.payer` → `InvalidOrderSignature` |
| `testFrontRunDifferentPayerRejected` | attacker can't take a signed order and swap the `payer` field — digest changes, sig invalid |
| `testZeroAmountRejected` | `amount=0` → `InvalidTerms` |
| `testPayerEqualsMerchantRejected` | collapsed roles → `InvalidTerms` |
| `testDisallowedTokenRejected` | a token not in the constructor allowlist → `TokenNotAllowed` |
| `testFeeTransferFailureRollsBack` | if the fee transfer fails, the entire settle reverts — payer balance restored, order not consumed, nonce not consumed |
| `testReentryBlocked` | malicious token re-entering `settle` during `receiveWithAuthorization` → revert (nonReentrant) |
| `testFuzzExactMathHolds` | fuzz 256 runs: exact-math balance invariants hold for all `(amount, fee)` |

Full output in `docs/evidence/step-03-forge-output.txt` (captured from `forge test -vv`).

## Not in scope for Step 03

- No deploy, no broadcast, no on-chain evidence. That is Step 04.
- No second-teammate security review yet. **Required gate before Step 04.**
- No fork test against official Whitechain USDT. Existing `test/fork/OfficialTokenFork.t.sol` covers the PoC against the live token source; a production fork test will be added in or alongside Step 04 once the final deployment addresses are known.
- No governance / ownership / upgradability. Explicit non-feature; contract has no admin surface post-construction.
