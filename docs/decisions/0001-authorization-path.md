# ADR 0001 — Propose EIP-3009 receive authorization

Status: **PROPOSED — human approval and Step 02 live proof required**.

Current evidence update: Step 02 live proof is now technically verified and manually accepted by the user. Experimental payment 0x93b866b4855b0fe05a86578ecbebe174671417c809c8598822fb04a3623c4641 on chain 1874 paid merchant 5 USDT and fee 0.005, kept payer WBT zero, charged relayer WBT, and consumed order/token nonce. Both replay checks rejected through read-only calls. This validates experimental Path A; final contract/API acceptance remains pending. See the Step 02 report for exact receipt/balances and review limitations.

Date: 2026-11-05. Scope: authorization feasibility only; no checkout interface is approved or implemented.

## Evidence

The exact official Whitechain Sepolia USDT proxy supports permit and EIP-3009 in read-only signed simulations. See [compatibility evidence](../evidence/token-compatibility.md) and the [snapshot](../evidence/token-probe.json). All 25 checks passed. Implementation source/runtime and domain are cross-checked against live RPC.

## Proposed path A

Use `receiveWithAuthorization` to transfer the exact signed total from payer to the future checkout contract. The checkout contract must itself call the token, satisfying `to == msg.sender`, and atomically pay the merchant and fee treasury. If any part fails, all effects must revert.

Require a separately verified buyer order authorization binding orderId, payer, merchant payout, merchant amount, fee amount, fee recipient, official token, expiry, quote identifier, chain, and checkout contract. Bind the token authorization nonce to the canonical order terms, with the exact encoding documented and tested before any ABI freeze. The checkout must reject reused orders independently of the token nonce, enforce both time windows, and guard external calls. These are requirements for future design, not existing controls.

The relayer pays WBT. Payer never submits a WBT-funded approval transaction. Merchant fulfillment follows verified checkout receipts and authenticated idempotent webhooks.

## Alternatives

- Direct `transferWithAuthorization`: callable by an observer; direct invocation could consume the authorization and transfer to checkout outside its business logic. Do not use as the checkout entry path.
- EIP-2612 permit: live simulations pass; retain as a possible alternative, but allowance/permit races and separate order binding need care. No need to choose it while receiver-specific authorization is available.
- Smart account / EIP-4337: unnecessary for this proposed token authorization route; provider compatibility and onboarding remain untested.
- Permit2 alone: would still need initial ERC-20 approval and cannot prove gasless first use.

## Risks and Step 02 acceptance

Zero-value simulations do not establish positive-value payment, source verification of a checkout contract, atomic fee allocation, persistent nonce consumption, or replay rejection after settlement. Prove those with a funded official-USDT payer holding zero WBT, a separate WBT-funded relayer, exact merchant/fee balances, a receipt, and a replay that fails for the intended consumed authorization/order reason.

Record proxy implementation and code hash before proof/deployment. Changes to proxy implementation, blocklist status, or token governance can break assumptions. The token domain uses the proxy, not implementation address. Token timestamps are strictly inside `(validAfter, validBefore)`.

Before any external write, preview chain, signer addresses, constructor args/call data, required assets, estimated gas budget, and seek specific approval. Do not use the discarded probe keys for live funds. A second teammate must review the security-critical PoC and final contract.

## Blocking inputs for live proof

Establish how to obtain the exact official test USDT. Prepare isolated payer, relayer, merchant, and fee-recipient addresses through a private keystore workflow. Never paste private keys into chat. No funding, signing for broadcast, deployment, or faucet transaction was authorized or performed in Step 01.

## Step 02 experimental evaluation — 2026-11-05

User authorized the next step after Step 01 manual testing instructions. Experimental code under `packages/contracts/poc/` evaluates Path A without changing or freezing the future production checkout ABI. Human approval of a final interface and the second-teammate security review remain pending.

The PoC uses the EIP-712 order digest as the token authorization nonce and independently verifies an EOA order signature. The exact type is `Order(bytes32 orderId,address payer,address merchant,uint256 amount,uint256 fee,address feeRecipient,address token,uint256 validAfter,uint256 validBefore,bytes32 quoteId)` under domain `WhitePayAuthorizationPoC`, version `1`, chain `1874`, verifying contract = actual receiver. Token authorization uses the verified Tether USD/version 1/proxy domain.

Local tests and the official-code fork show correct atomic payouts, event, nonce consumption/replay, and rollback. The fork impersonates the token owner to mint local balances. This is not a live funding/payment proof. See [Step 02 evidence](../evidence/gasless-poc.md).

Build choice: experimental Solidity 0.8.24, Paris target, optimizer 200, OpenZeppelin 5.4.0. Official Whitechain Foundry docs (checked 2026-11-05) identify Prague as the supported maximum; Paris is a conservative lower target. Revisit and pin final deployment settings in Step 03/04.

## Operational funding update — user-reported DevRel recommendation

User explicitly requested evaluating YetiTrade testnet to acquire the existing exact official USDT with test WBT. The isolated-wallet funding plan and read-only verified sample are in `docs/runbooks/step-02-yetitrade-funding.md` and `docs/evidence/yetitrade-funding-preview.json`. This changes the Step 02 asset-acquisition plan, not the payment authorization architecture or final checkout ABI. It does not add swaps to the WhitePay product or authorize any trading, token approvals, funding transfer, deployment or Git action.

## Approved PoC correction — payer-scoped replay namespace

At the user's request the assistant performed the unavailable teammate's review as an explicitly labeled AI review. A pinned official-token local-fork test reproduced R-01: any funded payer can copy a victim's public orderId into their own otherwise valid order, settle first and consume the globally keyed `settled[orderId]` flag. This denies the victim payment without transferring victim funds or consuming the victim token nonce. Deployment is on hold.

User explicitly approved scoping replay protection to `(payer, orderId)`, regeneration of the deployment preview, and commit/push. Implemented a nested public mapping exposing `settled(address payer, bytes32 orderId)`. Existing signed fields/domains, total and token nonce digest remain unchanged. Updated PoC test readers/manual receipt checks to match payer plus orderId. RED: victim order failed with OrderAlreadySettled after a different payer copied its ID. GREEN: all 11 official-token fork tests pass, including both distinct-payer payments succeeding and same-payer reuse failing even with fresh signatures/terms. The final contract and downstream event reconciliation require separate corresponding correction/review in their milestones.

This approves and records the PoC interface change only. The prior unsigned transaction is invalid because creation code changed; the replacement reviewed preview is recorded in `docs/progress/step-02.md`. AI review was substituted at the user's request and is not independent human review. Specific deployment/payment approval remains pending. Existing code/commit approval does not authorize those transactions.

## Step 03 candidate follows the accepted live proof — manual approval pending

After accepting Step 02 and publishing evidence at 5fec28d, user explicitly requested starting Step 03. Applied the accepted payer-scoped replay correction to the separate final WhitePayCheckout candidate and updated its getter ABI/read method to require payer plus orderId. Signed fields, WhitePayCheckout/version 1 domain, atomic payouts and event including quoteId remain unchanged. Constructor remains chain plus initial token allowlist; the intended single-official-token chain-1874 configuration must be verified in Step 04. No additional admin authority or deployment is introduced.

R-01 regression was RED against original final source and GREEN after correction; chain ABI regression separately failed and passed. Final source is exercised by official-token local-fork tests rather than treating the earlier PoC fork as final-contract evidence. Downstream API/indexer reconciliation must still match payer/ID and complete terms during its own milestones. Candidate interface/manual acceptance and final security-review requirement remain pending; Step 03 implementation permission is not deploy/commit/push approval.
