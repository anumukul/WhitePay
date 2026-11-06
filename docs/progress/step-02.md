# Step 02 — Genuine zero-WBT authorization proof

STEP: 02 — Genuine zero-WBT live proof verified

STATUS: APPROVED — user accepted live payment/replay proof and explicitly authorized evidence commit/push to origin/main

## Current implementation snapshot

- Deployed the experimental EIP-712/EIP-3009 receiver and verified a live official-USDT payment with atomic merchant/fee payouts, exact balance changes, zero-WBT payer, and independent payer-scoped replay rejection. This is not the final product contract or approved final ABI.
- Added Foundry mock tests and official-token fork tests, plus Node tests for the public order planner, wallet metadata/config validation, and YetiTrade quote/call-data verification.
- Added public-address-only wallet configuration/export, read-only chain/balance preflight, and deployment gas estimation. Keystore passwords and private material stay in the user's local terminal; generated wallet and transaction JSON is ignored by Git.
- Latest local checks: 28 root Node tests, 10 mock-based Foundry tests and 11 official-token fork tests passed; shared typecheck, build and scoped formatting passed. Full repo formatting has 63 inherited issues recorded below. Live receipt/log/balance and read-only replay checks also pass.
- Payer received 10 official USDT then paid 5.005: current 4.995 USDT and exactly zero WBT. Merchant received 5 USDT, fee recipient 0.005 USDT; relayer paid the exact receipt gas/L1 fees. YetiTrade's earlier trading-wallet approvals remain as recorded; no revocations were sent.
- Experimental deployment/payment are verified at 0x6ae4Ee53ac2b98ADf9EF89d03500848bC8405F45. Step 02 is manually accepted; Step 03 has not been resumed. Later teammate code remains unaccepted pending its own review.

Implementation details, test history, transaction evidence, known deviations, and next approval gates are maintained in this report below and in the referenced runbooks. Do not treat old “awaiting funding” notes as current state where this snapshot supersedes them.

## Verified live proof and final manual acceptance

Payment [0x93b866b4855b0fe05a86578ecbebe174671417c809c8598822fb04a3623c4641](https://explorer.testnet.whitechain.io/tx/0x93b866b4855b0fe05a86578ecbebe174671417c809c8598822fb04a3623c4641) succeeded on chain 1874, block 12366248, hash 0xb8a32027805f09292aabf778a866d68f39fe596f3710a98b4f635129b98ea1ee. Relayer nonce 0, sender/receiver/value/gas/fee caps and complete unsigned hash exactly match approved payload. Source commit 64c5aa9; corrected receiver runtime matches the deployed proof. Signed terms and both recovered signatures match the approved payer, order, recipients, amounts and validity window; payment was mined inside that window.

Verified exactly one PaymentSettled event with matching orderId/payer/merchant/token/amount/fee/feeRecipient, exactly three official-token transfers (payer → receiver 5.005, receiver → merchant 5, receiver → fee recipient 0.005), and one matching AuthorizationUsed log.

| Role          | Before official USDT | After official USDT | WBT result                                     |
| ------------- | -------------------- | ------------------- | ---------------------------------------------- |
| Payer         | 10                   | 4.995               | Exactly zero before, after and at latest check |
| Merchant      | 0                    | 5                   | 0                                              |
| Fee recipient | 0                    | 0.005               | 0                                              |
| Receiver      | 0                    | 0                   | No residual tokens                             |
| Relayer       | 0                    | 0                   | 0.1 → 0.099029250888990698                     |

Actual gas 194111 at 5.001 gwei, L1 fee 9302 wei; exact total 0.000970749111009302 WBT. Relayer historical native balance delta equals this total. Latest queried balances match post-payment balances. Cumulative gas is not used as this transaction's gas charge.

Read-only replay checks passed immediately after settlement, within the original validity window: the same settle calldata reverts OrderAlreadySettled, and replaying the token authorization from the receiver origin reverts `TetherToken: auth invalid`. Both `settled(payer,orderId)` and token `authorizationState(payer,orderDigest)` are true. No second transaction was broadcast or gas spent for these checks. Local sanitized evidence: ignored `docs/evidence/poc-payment-verified.json`; no raw signature/calldata is printed.

Manual checks (public reads only):

```sh
cast chain-id --rpc-url https://rpc.testnet.whitechain.io
cast balance 0x9AfB652bB337eB4D5a09221Af7972D69B500e035 --ether --rpc-url https://rpc.testnet.whitechain.io
cast call 0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7 'balanceOf(address)(uint256)' 0x9AfB652bB337eB4D5a09221Af7972D69B500e035 --rpc-url https://rpc.testnet.whitechain.io
cast call 0x6ae4Ee53ac2b98ADf9EF89d03500848bC8405F45 'settled(address,bytes32)(bool)' 0x9AfB652bB337eB4D5a09221Af7972D69B500e035 0xe35c2bb9b0491dec5d75f3603561407169ca1b78740d189116511a9d262d8157 --rpc-url https://rpc.testnet.whitechain.io
cast call 0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7 'authorizationState(address,bytes32)(bool)' 0x9AfB652bB337eB4D5a09221Af7972D69B500e035 0xb66f43b094455933d1b7fbb5d3abbeb8ed70421389402b67844ed4b2e17473f0 --rpc-url https://rpc.testnet.whitechain.io
```

Expected outputs in order: 1874, 0 WBT, 4995000 raw USDT units, true, true. Open the explorer payment link and compare the three transfers and one settlement event against the table above. Do not rerun any `--send` launcher: nonce/order/authorization are consumed. No future signatures or renewed terms are needed for acceptance.

User manual acceptance received: APPROVE STEP 02 AND COMMIT/PUSH TO origin/main. This report accompanies the explicitly authorized evidence commit; private wallet files, signing payloads/signatures and raw local evidence JSON remain ignored. Stop after publication before Step 03; no new implementation/deployment/payment is authorized. Limitations: successful canonical L2 receipt verified, no Ethereum-finality claim; experimental PoC only; no explorer source-publication claim; user explicitly substituted AI source review for unavailable teammate review; two private payer signatures are required and production SDK/wallet UX is not proved by this test. Final checkout still requires R-01 correction and its own review/deployment milestone.

## Resumption check after teammate handoff

### Approved payer-scoped replay correction — current result

**Specific payment approval received:** user approved the displayed 5-USDT merchant amount + 0.005-USDT fee, chain 1874, relayer nonce 0, exact calldata, expiry and fee caps. Final read-only check passed at block 12366177: same calldata hash 0xfc8c2371b6bcab73c25084f6a8bb8b7c260a84f1c96e515b2d987c9d16ecf2e0 and unsigned hash 0xdef192a55577e2aa2f5565089402166629f3a70db81c6da7f157394fc2f0e5b2, recovered payer signatures, untouched order/token nonce, runtime/implementation unchanged, nonce 0 latest/pending, payer 10 USDT / 0 WBT, relayer 0.1 WBT. Exact settlement resimulation passed; gas estimate 219,028 under 500,000 limit, max fee 20 gwei / priority 0.001 gwei; estimated total 0.001095359028009933 WBT including L1 quote 9933 wei.

Prepared temporary user-private relayer launcher `/private/tmp/whitepay-send-approved-payment.mjs`. Twelve offline guards passed for changed nonce/chain/value/gas/fees/target/sender/calldata/expiry and near-expiry limits; syntax and live `--check` passed. Only `--send` in an interactive terminal invokes Cast with the encrypted relayer keystore and exact approved flags; it rechecks all live state first. It refuses expired/near-expiry terms and nonce changes and never silently renews. It does not print signatures or calldata during precheck. The assistant has not invoked `--send`, unlocked any keystore or broadcast. Public precheck is ignored at `docs/evidence/poc-payment-approved-precheck.json`. Await user receipt; if Cast reports an error, check chain state before rerunning because a broadcast might already have occurred.

**Actual signatures verified; settlement simulation passed — awaiting separate broadcast approval:** user returned the public signing-success summary. Assistant read the owner-only local signature file without displaying its contents, recomputed both exact approved typed-data digests and recovered both signatures to payer 0x9AfB652bB337eB4D5a09221Af7972D69B500e035. At block 12365985 verified chain 1874, deployed receiver and token proxy/implementation/runtime, all participating accounts unblocked, unused payer-scoped order and token nonce, relayer latest/pending nonce 0 and sufficient balances. Exact settle calldata decoded to approved payer/amount/fee. Read-only `simulateContract` succeeded, and independent actual-wallet gas estimate was 219,028. Requeries confirmed simulations did not consume order/token nonce or debit payer funds.

Payment preview: sender relayer 0xba780C2e4e79e4109EC53b52fCE9982f33962A92 → deployed PoC 0x6ae4Ee53ac2b98ADf9EF89d03500848bC8405F45, chain 1874, nonce 0, native value zero, gas limit 500,000, max fee 20 gwei, priority cap 0.001 gwei. Estimated total fee 0.001095359028010285 WBT at 5.001 gwei including L1 quote 10285 wei; maximum L2 fee 0.01 WBT plus variable L1 fee. Authorization expiry remains 2026-11-06T11:15:23Z (16:45:23 IST).

Exact calldata selector 0x533e48aa, length 612 bytes, hash 0xfc8c2371b6bcab73c25084f6a8bb8b7c260a84f1c96e515b2d987c9d16ecf2e0; unsigned transaction hash 0xdef192a55577e2aa2f5565089402166629f3a70db81c6da7f157394fc2f0e5b2. Full calldata/unsigned transaction contain spend authorizations and are kept in a new ignored 0600 `payment-transaction.json` beside the signature file. Public redacted preview is ignored locally at `docs/evidence/poc-payment-broadcast-preview.json`. No raw signatures/calldata were logged.

Current payer 10 USDT / 0 WBT; merchant/fee/receiver 0 USDT; relayer 0.1 WBT. Expected settlement: payer 4.995 USDT / 0 WBT, merchant 5 USDT, fee recipient 0.005 USDT, receiver 0 USDT, relayer approximately 0.098904640971989715 WBT. These are predictions until a mined receipt and exact Transfer/PaymentSettled logs are verified. Obtain specific broadcast approval; recheck expiry, nonce, balances and simulation immediately before signing. Replay rejection will be tested read-only after successful payment. No broadcast or additional wallet signing was performed by the assistant.

**Signing approval received:** user approved payer signing for exactly 5 USDT + 0.005 USDT under the displayed expiry (2026-11-06T11:15:23Z). Prepared temporary helper `/private/tmp/whitepay-sign-approved-payment.mjs` with exact approved order/token digest pins, canonical typed-data validation against the existing planner, fixed amounts/payer/receiver/expiry, 120-second expiry margin, deployed/token code and nonce checks. Its 12 offline guard checks pass (field/domain/type/amount/nonce tampering, expired/near-expiry terms and unexpected signing output). Syntax check passes. Live `--check` mode passed at block 12365793 and exited before wallet unlocking/signing. The assistant has not run `--sign`.

User-private `--sign` requires an interactive terminal and calls only Cast `wallet sign --data --from-file` twice using the existing payer keystore. It captures bounded signature output without displaying it, recovers each signature against the reviewed payload to require the expected payer, and saves only after both succeed to a new 0600 file under a 0700 `keystores/whitepay-sepolia/authorizations/<orderId>/` directory (already Git-ignored). No private key/password is read by the helper. No wallet is created, and no transaction/broadcast method exists in it. User should return only the public success summary; signatures remain local. If the terms expire, stop and prepare a fresh reviewed preview instead of silently extending approval.

**Next payment signing preview — NOT SIGNED/NOT BROADCAST:** prepared public typed data at block 12365555 after verifying deployed receiver runtime, official token proxy/implementation, token domain separator, unused payer-scoped order and token nonce, all role blocklist statuses and current balances. Existing planner generated both typed-data messages; onchain orderDigest exactly equals offchain digest. EIP712Domain type fields are included in the public JSON for Cast `wallet sign --data --from-file`, whose installed help was checked without signing.

Exact signing terms: payer 0x9AfB652bB337eB4D5a09221Af7972D69B500e035; receiver 0x6ae4Ee53ac2b98ADf9EF89d03500848bC8405F45; merchant 0xB5bd941E218c88707a2BbABEb3cb0BDbE1543c9C receives 5 USDT; fee recipient 0x2F51C76D37BA9118ce8D5b9377329965ddb411c2 receives 0.005 USDT. Total authorized debit 5.005 official USDT, expected payer remainder 4.995 and zero WBT. Order domain WhitePayAuthorizationPoC/version 1/chain 1874/deployed receiver; token domain Tether USD/version 1/chain 1874/official USDT proxy. Valid strictly after 2026-11-06T10:44:23Z and before 2026-11-06T11:15:23Z (16:45:23 IST). Order ID 0xe35c2bb9b0491dec5d75f3603561407169ca1b78740d189116511a9d262d8157; quote ID 0x0ab9cda568be41e9bc34e0815cf453691dc09ae10bab2592280360bc431eaecf. Order digest and token nonce 0xb66f43b094455933d1b7fbb5d3abbeb8ed70421389402b67844ed4b2e17473f0; token authorization digest 0x098f8386c5f0e5048a8e69b3758651af1b849e09d7d0a1e60af83d96c5363d9e.

Payloads and preview are local/ignored under `docs/evidence/poc-payment-*.json`. No wallet was unlocked, no signatures generated, no signing command executed. Request signing-term approval first; payer signing will cost zero WBT and must keep secrets/signatures local. Expired terms require a fresh preview and review. After signatures are independently recovered/verified, simulate exact settle calldata and estimate actual gas/L1 fee before separate relayer broadcast approval. Proposed budget only: relayer nonce 0, gas ceiling 500,000, max fee 20 gwei and priority cap 0.001 gwei, maximum L2 fee 0.01 WBT plus variable L1 fee; this is not an actual gas estimate or broadcast approval.

**Experimental deployment VERIFIED:** user supplied receipt for 0x3d972265aaa0dbfd05a7a6c63896564b80c2fc2c6deb8029bf421ae5f8057ac8. Independent RPC checks confirmed chain 1874, canonical successful receipt at block 12365262, deployer/nonce 2, creation transaction, value zero, gas limit 2,000,000, max fee 20 gwei and priority 0.001 gwei. Reconstructed unsigned payload hash exactly matches approval; creation code exactly matches the corrected artifact and commit 64c5aa9. Contract address matches prediction: 0x6ae4Ee53ac2b98ADf9EF89d03500848bC8405F45.

Full runtime bytes were compared with read-only constructor re-execution at the preceding block with the same sender and historical nonce 2; exact match includes EIP712 cached chain/address/domain immutables. Runtime is 5590 bytes, hash 0x438a2440fdaa756693216cfbfcb25fb9a7d1e89c9cab7a9500b5b4a0b81a332f. Smoke checks passed CHAIN_ID=1874, exact official TOKEN, domain name WhitePayAuthorizationPoC/version 1/chain 1874/actual receiver, two-argument payer-scoped settled getter, and an offchain/onchain order-digest comparison. The comparison uses unsigned synthetic terms, not a payment signature or authorization.

Actual gas 1,300,184, effective price 5.001 gwei, L1 fee 115730 wei; total 0.00650222018411573 WBT. Deployer 1.69978995799999224 → 1.69328773781587651 WBT reconciles exactly with receipt fees. Payer remains 10 official USDT and zero WBT before, after and at latest query. Full public evidence is local/ignored in `docs/evidence/poc-deployment-estimate-verified.json`. Source has not been posted/verified on explorer; canonical L2 success is checked, Ethereum finality is not asserted. No live payment, additional signing, broadcast, commit or push was performed by the assistant during verification.

Specific deployment approval subsequently received: chain 1874, nonce 2, exact displayed bytecode/payload, gas ceiling 2,000,000, max fee 20 gwei, priority cap 0.001 gwei. Final read-only precheck passed at block 12365194: matching source/initCode/unsigned hash, nonce 2 latest/pending, no code at predicted address, unchanged official-token implementation/runtime, payer zero WBT and sufficient USDT, gas 1,311,670, estimated fee 0.006559661670109989 WBT including L1 quote 109989 wei. No additional approval is needed for these unchanged deployment terms.

Prepared temporary private-terminal launcher `/private/tmp/whitepay-deploy-approved-poc.sh`. Its tested `--check` mode exits before signing; `--deploy` requires an interactive user terminal, reruns the pinned-payload and live prechecks, then invokes Cast with the existing encrypted deployer keystore and exact approved gas/fee/nonce flags. It never reads keystore contents or passwords itself, and its public Node precheck contains no signer. Shell syntax check and read-only check mode passed; `--deploy` was not run by the assistant. User enters the password only in Cast's local hidden prompt. Await actual transaction hash/receipt before claiming deployment; payment remains separately unapproved. Public approved-precheck JSON is ignored under the existing deployment-estimate pattern.

User approved the interface correction, regenerated preview and associated commit/push. User also explicitly substituted AI review for unavailable teammate review. Neither approval authorizes deployment/payment.

Implemented nested `settled[payer][orderId]`, with the same key checked and marked before token calls. Updated test readers to `settled(address,bytes32)`. Signed fields/domains, token nonce digest, event and atomic payouts remain unchanged. Receipt readers must match payer plus orderId and full economic terms. Final WhitePayCheckout is separate and still requires this correction in Step 03.

TDD: the new `testDifferentPayerCannotBlockSignedOrder` failed against old source with OrderAlreadySettled (10 pass / 1 fail). After correction all 11 official-token fork tests passed. The regression asserts attacker and victim storage separately and completes both payments. A second regression rejects the same payer/orderId even with fresh signatures, quoteId and fee. Ten local PoC tests and all 28 root Node tests also passed; shared-package typecheck passed. These are local/fork checks, not live WhitePay settlement.

End-to-end public preflight exited 0 at block 12364932: READY_FOR_DEPLOYMENT_REVIEW, no funding blockers, same corrected initCodeHash and gas estimate. Scoped Prettier, Solidity formatting and whitespace checks pass. Full `pnpm lint` exits 1 because 63 unchanged teammate files have existing formatting issues; none of the flagged files belongs to this fix. Those files were not reformatted as part of this security correction. Root typecheck covers shared-package code only; no full offchain-stack validation is claimed.

Post-fix AI review confirmed matching replay keys on read/write, atomic marking/rollback, unchanged signatures and payout guards. No remaining deployment-blocking defect was identified in this experimental scope. This is not an independent human audit. EOA-only signatures, direct-donation loss, official-token governance and timestamp limits remain.

Regenerated preview at chain 1874, block 12364742:

- Source SHA-256 `479d5d0687c661312720a05afc68b349e5c6a5ae381881e7a3048716c9754f76`; Solidity 0.8.24 / Paris / optimizer 200 / viaIR=false.
- Creation code 6681 bytes, keccak256 `0x76136b7ffff3f58ffb5299131bdbe697638e07eda46213260406ea45cae0a4d8`.
- Sender deployer `0x59F5C817cF19394402DcefeBaf5796Fe7514fDed`, nonce 2 (latest/pending agree), no destination/constructor args, value zero. Predicted address `0x6ae4Ee53ac2b98ADf9EF89d03500848bC8405F45` currently has no code.
- Estimated gas 1,311,670; limit 2,000,000; max fee 20 gwei; priority cap 0.001 gwei. Observed price 5.001 gwei, L1 quote 115703 wei, estimated total 0.006559661670115703 WBT. Maximum L2 fee 0.04 WBT plus variable L1 data fee.
- Deployer before 1.69978995799999224 WBT, estimated after 1.693230296329876537 WBT. Payer remains 10 USDT / 0 WBT; relayer 0.1 WBT. Official proxy/implementation/runtime match evidence; all five roles are unblocked EOAs.
- Unsigned payload hash `0xcff207c68a6ba82f3330884a6fa62dc5c977327d79eee7bcfa87ac395475e855`. Full public transaction remains ignored locally in `docs/evidence/poc-deployment-estimate-review.json`. Existing encrypted deployer keystore checked only for file permissions; no contents read.

Manual checks: `pnpm test:poc` (10), `pnpm test:poc:fork` (11 local-fork tests), `pnpm test` (28 root tests), and read-only public preflight. After a separately approved deployment, query `settled(address,bytes32)(bool)` with payer and order ID. Old one-argument PoC getter and all pre-fix bytecode/transaction previews are obsolete. Recheck nonce/gas/fees before signing; subsequent 5-USDT + 0.005-USDT payment requires separate approval.

### Historical pre-fix experimental review package — superseded

**Review update — deployment ON HOLD.** User explicitly requested that the assistant replace the unavailable teammate review. This is an AI source review under that user exception, not an independent human signoff. Expanded executable review found the issue below; the earlier limited assessment does not constitute approval to deploy.

**R-01 — cross-payer order-ID squatting (medium, blocks deployment pending correction).** `settled` is keyed solely by `order.orderId`, and `settle` is permissionless. A different payer can construct their own valid order using a publicly visible victim orderId, their own payer/merchant addresses, amount 1 USDT minor unit, zero fee, and both of their own valid signatures. Settling that order first sets the global flag. The victim's previously signed order then reverts with `OrderAlreadySettled`. Victim funds and token nonce remain untouched, but checkout is denied; generating random IDs does not prevent copying an ID once a transaction is visible. The same global-key pattern exists in the later final-contract code, which must receive its own repair/review in Step 03.

Reproduction: `testReviewDifferentPayerCanConsumeGlobalOrderId` uses the exact official token on a pinned LOCAL fork and an explicitly synthetic attacker balance. All signatures are genuine for the local test accounts; it does not rely on bypassing token authorization. Its PASS means the attack was reproduced, not that the receiver is secure.

Recommended correction: bind the replay namespace to payer plus orderId, for example `mapping(address => mapping(bytes32 => bool)) public settled`, consistently checked and marked in settlement. Require a regression where the attacker order succeeds but cannot prevent the victim order, and where the same payer/orderId still cannot settle twice even with changed quote terms. This changes the public settled getter and requires the PoC tests/readers/manual checklist to be updated. It preserves the signed economic terms and EIP-3009 digest binding. Core-interface change approval is pending under PR.md rule 0.1.12; no contract change or weakened assertion has been made during this review.

Other review results: all nine mutable order fields rejected original signatures; malformed order signature left funds/order/token nonce unchanged; zero-fee official-token settlement left no residual balance. Existing official-token tests cover exact event/payouts, receiver-specific authorization, invalid token signature, blocklist failure, insufficient funds, full fee-payout rollback and same-order/token-nonce replay rejection. Payer authorization covers recipient, total and nonce; EIP-712 domains bind chain/receiver. No fund-redirection or partial-payout path was reproduced in the reviewed cases. Remaining limitations include EOA-only signatures, unrecoverable direct donations, token governance/blocklisting and sequencer timestamp boundaries. This limited review is not a general security audit.

Review validation: final `pnpm test:poc:fork` passed 10/10 tests at pinned block 12300809, including the attack reproduction and three added security cases. Test development first exposed a missing test cheatcode overload and stack depth in the attack test; these were corrected in test helpers without changing compiler settings or contract code. The deployment source hash/bytecode remains unchanged; the prior unsigned preview is on hold and must be regenerated after the approved correction.

Assistant source assessment covered `packages/contracts/poc/WhitePayAuthorizationPoC.sol`: exact official token/chain constants; EIP-712 binding of all economic terms; token authorization nonce equals order digest; token receive restricted to this receiver by token semantics; independent order replay guard set before external calls; nonReentrant; SafeERC20 and exact debit/credit/residual checks; no admin/upgrade functions. No release-blocking defect was identified in this limited review. This is not an independent teammate signoff or an audit. Known limits: EOA payer only, direct token donations have no recovery path, official-token governance/blocklisting remains external risk, strict block timestamps apply. Never send USDT directly to the receiver.

Fresh checks: 10/10 local PoC tests, 14/14 focused Node planner/wallet tests, 6/6 official-token fork tests at pinned block 12300809. Fork funding is synthetic local funding, not the required live proof. No production checkout test result or deployment is implied.

Exact unsigned experimental deployment preview at block 12364246:

- Source SHA-256: `3bbe4ac4802d901b34a0e620b3b55f12dec9a04d2a6f421a67f18fa5e96d13ba`.
- Solidity 0.8.24, Paris, optimizer 200, viaIR=false. Creation code 6552 bytes; keccak256 `0xd15dad4d28075c99ab1088906ddd85de35bf57e34e2d198c7e81694c68cdfe18`.
- Sender deployer `0x59F5C817cF19394402DcefeBaf5796Fe7514fDed`; chain 1874; latest/pending nonce 2. Creation transaction has no destination and no constructor arguments; native value zero.
- Predicted address `0x6ae4Ee53ac2b98ADf9EF89d03500848bC8405F45` currently has no code. Not deployed.
- Estimated gas 1,283,551; proposed gas ceiling 2,000,000; maxFeePerGas 20 gwei; priority cap 0.001 gwei. Observed gas price 5.001 gwei; quoted L1 data fee 126306 wei; estimated total 0.006419038551126306 WBT. Maximum L2 fee 0.04 WBT plus variable L1 data fee.
- Deployer before 1.69978995799999224 WBT, estimated after 1.693370919448865934 WBT. Payer remains 10 USDT / 0 WBT, relayer 0.1 WBT; deployment moves no payer/merchant tokens.
- Exact unsigned payload hash `0x6f178afdbcf6b5b5955fbdfd9b460d5fdff28c16e0e6f578d96f696234871bb1`; full public payload is local/ignored in `docs/evidence/poc-deployment-estimate-review.json`. Existing deployer keystore permissions checked as 0600, without reading/decrypting its contents.

Manual gate: second teammate must review the source at the hash above, including signature fields/domains, total=amount+fee, atomic payouts/rollback, role separation, replay and external token risks, and record findings/signoff here. This independent review is required by the Step 02 live checklist; it is still PENDING. Once signed off, the exact deployment requires separate explicit transaction approval and a fresh nonce/fee recheck. Any source/build change invalidates this preview and requires re-estimation. Subsequent payment of 5 USDT + 0.005 USDT fee requires separate signatures/approval; expected payer remainder 4.995 USDT, merchant +5, fee recipient +0.005, payer WBT zero. Payment gas is not yet measured.

Latest funding result: transaction 0xd447e993efc4a199c2a322a9079c8166cbeee27937882673e5d5a5d8d3d9caa4 succeeded on chain 1874 at block 12363962. Verified canonical receipt, exact token transfer calldata, nonce 4, native value zero, Transfer log and historical balances. Payer USDT 0 → 10; trading USDT 11.019904 → 1.019904; payer WBT was zero before, after and at latest check. Trading WBT 0.048655711195984281 → 0.048351095284981521; exact fee 0.00030461591100276 WBT reconciles with receipt gas 60,911 × effective 5.001 gwei plus L1 fee 2760 wei.

Wallet settings differed from the approved payload: gas limit 61,736 rather than 80,000, max fee 5.001 rather than 20 gwei, and priority cap 5.001 rather than 0.001 gwei. The priority cap exceeded its approved setting; this is not an exact-payload match. No additional transaction was initiated by the assistant. Full public evidence is local and ignored in `docs/evidence/trading-to-payer-usdt-transfer-verified.json`.

Post-funding preflight exited 0 at block 12364125: READY_FOR_DEPLOYMENT_REVIEW, payer sufficientOfficialUsdt=true / zeroWbt=true, no funding blockers. Deployer nonce 2 predicts experimental receiver 0x6ae4Ee53ac2b98ADf9EF89d03500848bC8405F45, estimated deployment gas 1,283,551. This is an unsigned estimate, not deployment consent or a deployed contract. Teammate review and a fresh exact deployment/fee preview remain required before deployment approval.

The user requested continued work with a manual test/approval gate at every step before commit/push. Existing later-stage code is retained. Step 02 remains the earliest unmet acceptance gate.

- RED: `pnpm poc:preflight docs/evidence/poc-config.json docs/evidence/poc-preflight-resume.json` failed before RPC because the default Foundry script discovery included the new final-contract deployment script and compiled its imported final contract without the Step 03 via-IR settings.
- Fix: set default `script = "script/poc"` and Step 03 `script = "script"` in Foundry configuration. This isolates PoC commands from final-contract scripts without changing either contract or its compiler pipeline.
- GREEN: `pnpm test:poc` compiled successfully and passed all 10 PoC tests. Preflight then compiled successfully but exited 1 at RPC with `HTTP request failed`. No fresh balances or successful preflight are claimed.
- User manual follow-up: all 10 PoC tests passed. The generated `poc-preflight-manual.json` completed at chain 1874, block 12363387, with exact official token address. Deployer held 1.69978995799999224 WBT and relayer 0.1 WBT; payer held exactly 0 WBT and 0 USDT. The only remaining preflight blocker is payer token funding: 5.005 USDT required by configured terms, 10 USDT planned for funding. The pasted terminal output ended before this result, but the completed local public evidence was reviewed directly. This verifies the tooling repair, not the live payment proof or Git approval.
- Refreshed payer-funding preview at block 12363570: independently confirmed chain 1874, official token proxy/implementation runtime hashes and six decimals, unblocked EOA sender/recipient, payer zero WBT, trading 11.019904 USDT / 0.048655711195984281 WBT, and latest/pending nonce 4. Direct transfer simulation succeeded; estimated gas 61,736 under proposed 80,000 limit. Max fee 20 gwei, priority cap 0.001 gwei; estimated total fee 0.00030874173600346 WBT including quoted L1 fee. Expected payer 10 USDT / 0 WBT and trading 1.019904 USDT. Saved refreshed local preview with identical unsigned payload hash 0xdccaf4e47ceab6633393aa6a5c037f6629d4934e3e61915c7e38bdf446602dc6. Status: awaiting specific transfer approval; no allowance transaction needed and no transaction sent.
- User explicitly approved the 10-USDT transfer on chain 1874, nonce 4 with the displayed fee limits. Final read-only checks passed at block 12363677: latest/pending nonce 4, sufficient trading balances, payer 0 WBT / 0 USDT, official runtime hashes unchanged, neither account token-blocklisted, successful transfer simulation, gas 61,736 within 80,000 and estimated total fee 0.0003087417360033 WBT. Exact approved unsigned hash still matches. Local approved-precheck JSON is ignored. Awaiting signing in the user's isolated trading wallet and receipt verification; no assistant signing/broadcast or unrelated action authorized.
- Manual check: run `pnpm test:poc`, then `pnpm poc:preflight docs/evidence/poc-config.json docs/evidence/poc-preflight-manual.json`. Expect 10 passing tests and an actual chain-1874 wallet table. Funding readiness requires payer WBT exactly zero and at least 5.005 official USDT under the default 5-USDT payment plus 0.005-USDT fee. The acquisition target remains 10 USDT. Share only the public output or error.
- Files changed for this resumption: `packages/contracts/foundry.toml`, this report, and `docs/progress/STATE.md`. No signatures, broadcasts, deployments, commits or pushes performed. Full Step 02 acceptance still requires the separately approved live payment and replay proof, beyond this tooling repair.

## Scope completed

Experimental receiver, local/fork tests, two-signature order planner, and read-only public-address/balance/deployment preflight. Later teammate work is preserved but does not establish acceptance of this live proof.

FILES ADDED/CHANGED: `packages/contracts/foundry.toml`, experimental `poc/WhitePayAuthorizationPoC.sol`, `test/poc/AuthorizationPoC.t.sol`, `test/fork/OfficialTokenFork.t.sol`; `scripts/poc/plan.mjs`, `scripts/poc/preflight.mjs`; `tests/poc-plan.test.mjs`, unfunded public fixture; package scripts/lockfile; formatting ignore; evidence, ADR, architecture/README/limitations, progress docs. Step 01's manual snapshot and local progress edits existed before this step and were preserved.

## TDD proof and commands actually run

- First `forge test --root packages/contracts -vv` failed (exit 1) for unavailable compiler network access. The network-enabled retry reached the intended RED: missing PoC source (exit 1).
- Added implementation with exact OpenZeppelin 5.4.0 dependency. Compilation exposed explicit solc import allow-path and stack-depth issues; allowed the workspace node_modules path and replaced separate balance locals with a memory struct. Foundry also rejected a reserved `testFail*` name; renamed it. The tampered-merchant test initially hit duplicate-recipient validation, so its mutation was corrected to a distinct recipient to exercise the intended signature rejection.
- `pnpm test:poc`: final exit 0, **10 passed**.
- First fork run: 1 pass, 3 fails because argument evaluation called external getters after `expectRevert`. Precomputed arguments before setting expectations; rerun passed. Strengthened event, fee rollback, and insufficient-funds assertions: final `pnpm test:poc:fork` exit 0, **6 passed**.
- Node proof-plan tests: initial RED for missing module, then RED for unknown-field secret copying (expected rejection absent); fixed with explicit public-field allowlist. Final planner suite: **5 passed**. Final full Node suite: **14 passed**, exit 0.
- Blank-config preflight exited 1 for missing public deployer. Network-enabled preflight with labeled unfunded fixtures exited 1 for three expected funding blockers. It read official chain metadata/balances and generated a non-authorizing preview, without creating credentials or submitting transactions.

STATIC CHECKS: `pnpm lint`, `pnpm typecheck`, `pnpm test` (14/14), `pnpm build`, both default/fork `forge fmt --check`, and `git diff --check` passed (exit 0). `node --check scripts/poc/preflight.mjs` passed. `forge build` succeeded and emitted two timestamp-comparison warnings; these intentional EIP-3009 validity checks are documented and boundary-tested. Final tracked diff stat: 9 files, 74 insertions / 11 deletions before this report update; added PoC/tests/evidence are untracked. `git log -1` remains Step 01 commit `013a87b` (no commit/push).

## Security, risks, and testnet evidence

Live payment: **NOT VERIFIED**. No deployment, transfer, faucet claim, wallet creation, commit, or push performed. Public fixture addresses are not user wallets; do not fund them. Fork owner impersonation/minting is synthetic and local. Source has not received the required second-teammate security review.

No secrets requested, read, printed, or saved. Keystore creation/import must happen privately. Only fresh dedicated testnet wallets should be used. Payer has exactly zero WBT throughout the real proof. L2 gas caps are preliminary and exclude L1 data fees.

DEPLOYED URLS: NOT DEPLOYED. Actual transaction hashes: NONE.

## Manual test script

1. `pnpm install --frozen-lockfile`.
2. `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build` — expect success; 14 Node tests.
3. `pnpm test:poc` — expect 10 local Foundry tests.
4. `pnpm test:poc:fork` — requires public read-only network access; expect 6 local fork tests. No testnet writes.
5. `pnpm poc:preflight docs/evidence/poc-config.example.json docs/evidence/poc-preflight-manual.json` — expect BLOCKED/exit 1 because the example deliberately has no addresses.
6. Fill a copy with five real public roles only, then rerun. Readiness requires payer WBT=0, at least 5.005 official USDT under default terms, and adequately funded deployer/relayer. No keys or passwords in JSON.
7. Review [live proof checklist](../evidence/gasless-poc.md) and proposed experimental ABI/ADR. A deployment and payment each need a concrete preview and explicit consent before execution.

CURRENT FAILURES / LIMITATIONS: no real wallet configuration or confirmed official USDT acquisition; no actual deployment, successful payment receipt, fee balances, real relayer gas debit, or persisted live replay proof. Source review pending. Step 02 is incomplete until these pass.

HUMAN DECISION REQUIRED: provide public role addresses or request wallet-setup instructions; review local code and exact deployment/payment preview when available. No permission to commit/push inferred from moving to this step.

NEXT STEP: 03 — final contract TDD. DO NOT BEGIN.

## Wallet setup follow-up

User requested five dedicated encrypted testnet wallets, funding guidance, actual chain/balance verification, and an exact approval-gated live proof plan. Added `scripts/poc/wallet-metadata.mjs`, `wallet-config.mjs`, `estimate-deployment.mjs`, tests, public balance-table/check output, and `docs/runbooks/step-02-wallets.md`.

New metadata tests first failed for the absent module, then passed after implementation. They check owner-only permissions, encrypted-v3 metadata, and refusal to echo plaintext fields. User—not the assistant—will create/decrypt wallets in a private terminal. No real keystore creation/decryption was performed or claimed as tested. Actual balance confirmation still requires public wallet config.

Read-only deployment estimate tool succeeded with an explicitly unfunded public fixture sender. Saved chain/block/code hash, 1,283,551 gas, observed 5.001 gwei, and GasPriceOracle L1 quote. Total about 0.00641904 WBT is an example, not deployment authorization. No successful payment gas estimate is claimed before the actual receiver/signatures exist. Funding UI/documentation rate-limit wording differs; authenticated enforcement remains authoritative.

No test-USDT faucet verified. Prepared a message for the user to send to official DevRel; no message sent by the assistant. No faucet claim, funding, onchain write, commit, push, or Step 03 performed. User approval is required for each write and for eventual Git actions.

Wallet follow-up verification: `pnpm test` passed 16/16 tests; `pnpm typecheck`, `pnpm lint`, syntax checks for wallet-config/estimator, and `git diff --check` passed. Updated live fixture preflight returned the expected BLOCKED exit 1 and explicitly displayed payer zeroWbt=true / sufficientOfficialUsdt=false; these are fixture results, not user-wallet verification. The last Git commit remains `013a87b`.

## Specific relayer funding transaction preview

User requested preparing, but explicitly did not authorize broadcasting, a 0.10 WBT native transfer from the configured deployer to relayer. A read-only executable probe verified chain ID, all public address sources, keystore file type/0600 permissions (no contents opened), both native balances, latest/pending nonce, empty sender/destination code, gas estimate, GasPriceOracle L1 fee, snapshot consistency, and successful unsigned-transaction serialization round trip with exact chain/to/value/nonce/gas checks. Probe exited 0. Saved full unsigned fields, RLP and payload hash in `docs/evidence/relayer-funding-preview.json`.

At block 12307642: deployer 2 WBT, relayer 0 WBT; nonce 0; gas 21,000; max fee 20 gwei; priority cap 0.001 gwei. Estimated fee 0.00010502100000308 WBT, with a 0.00042 WBT L2 ceiling plus variable L1 data fees. Payer native balance remains zero and no payer transaction is involved. Expected relayer credit 0.10 WBT; expected deployer balance is an estimate subject to actual fees.

STATUS: AWAITING_EXPLICIT_APPROVAL for this specific funding transfer. No transaction was signed or sent, no key unlocked, no deployment, no Git mutation, no Step 03. After approval, revalidate the exact transaction and fees; derive signing address privately from the encrypted keystore; verify successful receipt, matching sender/recipient/value/nonce/chain, actual gas/L1 charges and both native balances. No unrelated operation is authorized by funding approval.

Specific transfer approval received. Revalidated exact unsigned fields and current RPC state at block 12307818; read-only probe exited 0. Saved approved precheck evidence. A proposed `cast wallet sign-transaction --help` lookup showed that subcommand is unavailable in this installed Foundry version; no signing occurred. The supported execution path is the exact approved `cast send` command with the encrypted deployer keystore and hidden password prompt in the user's private terminal. Transaction remains unbroadcast pending that private signing step; receipt/balance verification must follow an actual hash. No fresh approval is requested for the already-approved exact transfer.

## Approved native funding transfer — verified

User provided transaction hash 0x42f193df0f084dc6ed8a2b7ae1c364315c5ae8263065fc7e1a88539b5b2604db. Independent read-only RPC verification exited 0. Verified chain 1874, successful canonical receipt at block 12307940, exact approved sender/recipient/value/nonce/data/type/gas/fee caps, and reconstruction of the same unsigned payload hash. Verified recipient is not a contract deployment (`contractAddress=null`). No transaction was sent by the assistant.

Deployer historical balance: 2 → 1.89989497899999676 WBT. Relayer: 0 → 0.10 WBT. Payer native balance: 0 before, after and at latest query. Actual total fee 0.00010502100000324 WBT equals 21,000 × 5.001 gwei plus the independently reported L1 fee of 3240 wei. Current balances matched post-transaction balances. Full sanitized public transaction/receipt and reconciliation saved in `docs/evidence/relayer-funding-verified.json`.

This is relayer native funding only, not a USDT checkout/payment proof. Funding consumed deployer nonce 0, invalidating old nonce-0 deployment-address predictions. Deployment must have a fresh preview and separate approval. No Ethereum-finality claim, contract deployment, Git commit/push, or Step 03.

## YetiTrade isolated-wallet funding plan

User supplied DevRel guidance that exact USDT can be acquired at testnet.yetitrade.fi and requested a plan, not execution. Read-only investigation confirmed the chain-1874 token list and canonical router/factory/quoter addresses against the app/official docs and RPC. Exact-output token decimals are six. Router source is explorer-marked verified but not fully verified; its reported runtime matches RPC. Factory pool identities and an independent QuoterV2 eth_call matched the native-WBT quote.

Sample quote: 0.15 WBT input, 11.028196 USDT output, actual encoded minimum 10.973329 at 50 bps slippage. Decoded native route 0x0b00 wraps WBT inside router and pays wrapped input from router funds, without any ERC-20 approval. API simulationIncomplete=true was preserved; independent gas estimation with synthetic fixture native balance passed at 256,688 gas. A read-only sample 10-USDT transfer from an existing holder estimated 61,736 gas. Both actual trading-wallet estimates remain pending the actual wallet/quote and must be refreshed before approval.

TDD: `node --test tests/yeti-funding.test.mjs` first failed because helper did not exist, then all three cases passed after adding the validator. Tamper subcases cover chain, output token, router, native value, slippage, expiry, calldata minimum, recipient, token-payment source, and allow-failure flags. No remote API calldata is trusted without decoding.

Proposed plan: user-private fresh temporary browser wallet, separately approved 0.20 WBT funding, separately approved native 0.15 WBT swap with minimum ≥10 USDT, then separately approved direct transfer of exactly 10 official USDT to existing payer with native value 0. Payer WBT remains zero. No new wallet created or imported by assistant, no approvals signed, swaps executed, transfers broadcast, replacement token created, deployment, commit/push, or Step 03. Stop for plan review.

YetiTrade follow-up verification: `pnpm test` passed 26/26 tests; `pnpm typecheck`, `pnpm lint`, and `git diff --check` passed. Full plan is ready for manual review. No actual trading-wallet address or executable approval exists; all quote/gas figures are labeled sample simulations and require refresh.

## Trading wallet 0.20 WBT funding preview

User requested preview only for 0xeBd86998e8C765F92CC5022ff94eB093eFCFa8a4. Read-only executable probe verified address checksum and distinction from all existing roles; chain 1874; native balances; empty sender/recipient code; equal latest/pending nonce 1; exact 21,000-gas estimate; GasPriceOracle L1 quote; snapshot hash consistency; sufficient balance for value plus L2 maximum and quoted L1 fee; unsigned serialization round-trip for chain/to/value/nonce/gas/fee caps. Probe exited 0.

Saved `docs/evidence/trading-wallet-funding-preview.json` and public address record. At block 12310328, value 0.20 WBT, nonce 1, max fee 20 gwei, priority cap 0.001 gwei, estimated total fee 0.00010502100000356 WBT. Expected recipient 0.20 WBT and deployer 1.6997899579999932 WBT. Payer remains zero WBT. This exact transfer is awaiting approval; the earlier relayer transfer approval does not cover it. No keys read/unlocked, signing/broadcast, swap, deployment or Git action. Refresh and review actual trading-wallet YetiTrade quote after approved funding succeeds.

Specific 0.20 WBT trading funding approval received. Rechecked exact serialized fields, chain, nonce/pending nonce 1, source/recipient balances and code, 21,000-gas estimate, fee cap affordability, L1 quote and block consistency; read-only probe exited 0. Saved approved precheck at block 12310449. No keystore unlocked or transaction sent by assistant. Private-terminal Cast command will use only the approved values. Receipt/balance verification and refreshed YetiTrade quote follow the actual funding hash; a swap still requires separate approval.

## Trading funding receipt verified; actual-wallet swap refreshed

Independently fetched transaction and receipt 0xf170b0f3d39d7b638a6688fd1398b2e2d7364df47294fa2f31c62f1bc07aafda from chain 1874. Verified success, exact approved sender/recipient/0.20 WBT/nonce 1/empty data/gas/fee fields and reconstructed approved unsigned payload hash. Historical before/after native balances reconciled with L2 fee plus receipt L1 fee. Deployer now 1.69978995799999224 WBT and trading wallet 0.20 WBT at the receipt block. Evidence saved to `docs/evidence/trading-wallet-funding-verified.json`. Read-only verification probe exited 0; no assistant broadcast.

Requested a fresh unsigned quote for the actual trading wallet: 0.15 native WBT → quoted 11.023732 official USDT, minimum 10.968887 with 50 bps slippage, expiry 2026-11-05T19:38:27.272222883Z. Checked with the quote validator, canonical factory pools, independent QuoterV2, router runtime hash, exact token decimals, same-account output, native calldata and no approval path. Actual funded-wallet eth_estimateGas succeeded without state overrides at 263,697 gas. Proposed transaction: nonce 0, gas limit 350,000, max fee 20 gwei, priority cap 0.001 gwei. Estimated total fee 0.001318748697009102 WBT including current L1 quote. WWBT/USDT allowances to Permit2 both zero; token approval unnecessary for this native route. Payer WBT and USDT are both zero. Saved `docs/evidence/yetitrade-trading-wallet-swap-preview.json`.

Status: READY_FOR_HUMAN_REVIEW of the separate exact swap preview. Do not execute an expired quote. Funding approval does not approve the swap or later 10-USDT transfer. No signing, swap, approval, deployment, commit/push or Step 03 performed. No implementation changed in this read-only review; existing assertion-based probes passed.

## Refreshed swap presented for final explicit approval

User accepted terms only in principle and requested revalidation. Fresh unsigned quote saved in `docs/evidence/yetitrade-final-swap-preview.json`; no approval inferred. Read-only probe verified chain, exact sender/router/value/nonce/fee settings, empty trading-wallet code, no pending nonce, source token proxy/implementation/runtime, router runtime, decimals, canonical factory pools, independent QuoterV2 quote, actual-wallet gas simulation, ERC-20 allowances, payer zero WBT, encoded deadline/recipient/minimum, absence of partner fees/allow-failure, canonical serialization and snapshot consistency. Probe exited 0. Quote validator passed again immediately before saving.

Deadline 06/11/2026, 01:13:09 IST; 0.15 native WBT → quoted 11.023732 official USDT, minimum 10.968887. Trading nonce 0; gas estimate 263,697, proposed limit 350,000, max fee 20 gwei, priority cap 0.001 gwei. Estimated total fee 0.001318748697007368 WBT including L1 quote. Only native wrap + V3 exact-input; no ERC-20 approval required. Final swap approval and isolated-wallet private signing remain pending. Quotes expire and must be revalidated before execution. No swap, token approval/transfer, contract deployment, Git mutation, or Step 03.

Specific final swap approval received. Executable read-only precheck validated the exact stored payload, deadline, nonce, balance, router and gas again at block 12310991, exit 0. A private-terminal Cast browser-wallet launcher was prepared with exact stored/hash-bound fields and fresh prechecks, but did not work for the user and was removed during cleanup after the UI swap completed. It handled no keys or passwords. The quote/call-data tamper tests passed 3/3 at that checkpoint. No later USDT transfer or WhitePay deployment is confirmed.

## Actual user UI swap verification and separate payer transfer preview

User reported completion without a hash. Read-only indexer/RPC identified all four trading-wallet transactions and retrieved their successful receipts. Verified wrapped approval spender, Permit2 token/router, 0.15 WBT deposit, canonical router, ERC20-funded exact-input calldata, output recipient, token path, minimum and deadline. Verified exact official-token Transfer logs and before/after token balances: +11.019904 USDT. Four historical native balance changes equal 0.15 WBT wrapped plus 0.001344288804015719 WBT in receipt L2/L1 fees. Read-only verification probe exited 0.

Material UI differences: four transactions rather than the earlier reviewed native-input payload; actual swap minimum 10.803827 rather than 10.968887; unlimited WWBT ERC20 approval and max-uint160 Permit2 router allowance remain. Neither a 0.5% slippage setting nor adherence to the old payload is inferred. No automatic revocation performed; optional cleanup must have its own review/approval. Full evidence in `docs/evidence/yetitrade-ui-swap-verified.json`.

Then prepared (not sent) direct `transfer(payer,10000000)` on exact official USDT contract with native value zero, trading nonce 4, estimated gas 61,736, limit 80,000, max fee 20 gwei, tip 0.001 gwei. Actual-wallet simulation and fee-affordability checks passed. Expected trading remainder 1.019904 USDT, payer 10 USDT / zero WBT. Saved `docs/evidence/trading-to-payer-usdt-transfer-preview.json`. This transfer awaits separate explicit approval. No payer transfer or WhitePay deployment is confirmed; Step 03 has not started.
