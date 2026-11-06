# Step 02 proof evidence — local preparation only

Status: **R-01 FIXED; AWAITING SPECIFIC DEPLOYMENT APPROVAL; LIVE PAYMENT NOT VERIFIED**. User approved payer-scoped replay correction plus commit/push and substituted AI review for unavailable teammate review. Eleven official-token fork tests, ten local PoC tests and 28 root Node tests pass. Regenerated preview and review findings are in `docs/progress/step-02.md`; all pre-fix bytecode previews are obsolete. Nothing is deployed.

## Experimental implementation

`packages/contracts/poc/WhitePayAuthorizationPoC.sol` is disposable feasibility code, not the Step 03 checkout contract. It has no admin, upgrade path, product API, custody service, or production claims. It only accepts the official token on chain 1874 and supports EOA payer signatures.

Two signatures are required: an EIP-712 order covering orderId, payer, merchant, amount, fee, feeRecipient, official token, validAfter, validBefore, quoteId, chain, and receiver; then the token's `ReceiveWithAuthorization` signature with the exact total and order digest as nonce. The receiver calls the token itself and atomically forwards both payouts. Independent order uniqueness and a reentrancy guard protect settlement. Exact before/after token balances reject unexpected transfer behavior.

For this restricted proof, payer, merchant, and fee recipient must be distinct. Relayer/deployer are separate EOAs in preflight. No merchant price/quote service is implemented; the payer reviews and signs explicit experimental terms. Direct token donations could remain stuck because the PoC has no sweep function. Do not send tokens directly to it.

## Local tests actually run

- 10 Foundry mock-based tests: exact split and zero-native payer, duplicate order, amount/fee recipient binding, exact time-window boundaries, wrong chain, cross-contract signatures, fee failure rollback, and an offchain/onchain digest vector. The token mock does not validate its authorization signature; those signatures are checked separately against official code in fork tests.
- 6 opt-in fork tests against official chain 1874 token state at block **12300809**: positive-value settlement with exact event fields, consumed order/token nonce rejection, third-party receive rejection, invalid token signature, blocked caller, fee-payout rollback after merchant transfer, and insufficient USDT. Some tests cover multiple assertions.
- 5 Node proof-planning tests: public config validation, funding/zero-WBT gates, exact dual-signature binding, accidental secret-field rejection, and Solidity digest interoperability. Existing 9 Node baseline/probe tests remain.

**Fork funding is synthetic:** the test impersonates the token owner and mints within the local fork. Local code deployment, transfers, state changes, nonce consumption, and signatures are never submitted to Whitechain. The fork does not establish real gas paid by a relayer or a mined payment receipt.

## Public preflight

```sh
pnpm poc:preflight docs/evidence/poc-config.json docs/evidence/poc-preflight.json
```

First copy `docs/evidence/poc-config.example.json` to `poc-config.json` and fill **public addresses only** for deployer, relayer, payer, merchant, and feeRecipient. Never put keys, passwords, or seed phrases in this file. Unknown fields are rejected before network access or evidence output.

The preflight reads chain, code, implementation, token domain/decimals, block identity, balances, blocklist status, deployer nonce, and gas price. It checks zero payer WBT, exact official USDT total, and distinct role addresses. It records bytecode hash, predicted CREATE address, constructor args, and configured gas limits. It estimates deployment gas only when initial checks pass. No signer/wallet client or broadcast method is used.

The default proposed amount is **5 USDT**, service fee **0.005 USDT**, total **5.005 USDT**. These are reviewable experimental terms, not approved charges. Configured L2 gas caps are 2,000,000 deployment gas and 500,000 payment gas at up to 20 gwei (0.04 and 0.01 WBT respectively). They exclude L1 data fees; an additional fee estimate/reserve and explicit total-spend approval are needed before a write.

An earlier preflight used **unfunded fixture addresses**, not user wallets: [fixture](../../tests/fixtures/poc-unfunded-public.json). It correctly exited 1 with missing official USDT/deployer WBT/relayer WBT. The receiver address in that report was a prediction only; **nothing is deployed**. Never send funds to these fixture addresses. Later public-wallet funding and swap receipts are documented in the local, Git-ignored evidence files and summarized in `docs/progress/step-02.md`.

The blank example also exits 1 locally for a missing deployer address: [output](poc-preflight-blocked.json).

## Remaining live acceptance checks

1. Source review completed as AI review under the user's explicit exception for unavailable teammate review; payer-scoped R-01 correction is tested. Verify current public roles and official-token code hash/domain again before deployment. Payer funding of 10 official USDT and zero WBT is verified.
2. Keep payer WBT exactly zero. Fund only deployer/relayer with WBT and payer with the exact official token. Any faucet claim/funding action requires separate authorization; never fund public test fixtures.
3. Run preflight on the real public config. Preview actual deployer, nonce, creation code hash, constructor arguments (none), chain, gas estimate, total fee budget including L1 data fee, and predicted address. Obtain explicit deployment approval.
4. Deploy only after approval using the isolated encrypted keystore; record actual deployment receipt/address. Reconcile predicted address and runtime. The final checkout/source-verification milestone remains Step 04.
5. Prepare two typed-data signatures for that actual receiver and a short-lived unique order. Show merchant amount, fee, total, recipients, window, and domains. Payer signs via a private keystore/wallet workflow; no secret enters chat/logs.
6. Preview exact relayer transaction and simulate it. Record independent pre-payment balances, order/nonce unused, and signer/target. Obtain separate payment-broadcast approval. No payer transaction is sent.
7. Verify successful receipt and exactly matching receiver `PaymentSettled` and official-USDT Transfer logs. Requery payer WBT=0, exact token debit and merchant/fee credits, no residual receiver balance, and relayer WBT decrease matching fee evidence (including any L1 data fee).
8. Query `settled(address,bytes32)(bool)` with the exact payer/orderId; require true. Retry identical order with read-only `eth_call`; require `OrderAlreadySettled`. Query token authorizationState=true and test token nonce replay via recipient-origin simulation for `TetherToken: auth invalid`. Match payer and orderId together when reconciling events. Do not spend extra WBT solely to demonstrate a revert.
9. Save actual explorer links, block hashes, receipt/logs, and sanitized before/after balances. This is required to pass Step 02. A successful fork or preflight is insufficient.

## Official documentation checked

[Whitechain Foundry guide](https://docs.whitechain.io/build/deploy/deploy-with-foundry.md) says to pin compiler and EVM target, and identifies Prague as the highest supported target. The experimental build conservatively pins Solidity **0.8.24**, optimizer 200, **Paris**, below that supported maximum; fork execution confirms this build runs against the sampled token state. This is not the final deployment compiler decision.

[Official faucet guide](https://docs.whitechain.io/learn/get-started/get-testnet-wbt.md) describes WBT distribution. Its public landing page did not establish official USDT acquisition. No faucet claims made.

OpenZeppelin **5.4.0** is locked through pnpm for EIP712, ECDSA, SafeERC20, and ReentrancyGuard. No third-party signing service was added. Foundry warns about timestamp comparisons; these intentionally mirror the token's strict validity window and are covered at exact boundaries. They are sequencer/block-time checks, not wall-clock guarantees.
