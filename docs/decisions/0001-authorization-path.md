# ADR 0001 — Propose EIP-3009 receive authorization

Status: **PROPOSED — human approval and Step 02 live proof required**.

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
