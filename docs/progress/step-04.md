# Step 04 — Final checkout deployment and proof

STATUS: LIVE_PAYMENT_AND_REPLAY_VERIFIED — deployment/runtime and final-contract payment confirmed; explorer source verification remains unavailable. Manual acceptance and source verification pending; no commit/push or Step 05.

## Accepted prerequisite and review scope

User reported all Step 03 manual checks successful and requested the next step. Published Step 03 as 6f58f37 on origin/main under the agreed workflow. Candidate source SHA-256 is 37c440f166e04dd646a1b4c551115b7d0fd7a7b043abae889f6a9bbc56cba3a5. WhitePayCheckout source remains unchanged from that accepted commit.

The user previously asked the assistant to perform source review because the teammate was unavailable. Continue that review workflow for the final candidate, explicitly as AI review; do not claim independent human signoff or an audit. Step 03's review/tests cover domains/fields, payer-scoped replay, receiver-specific token authorization, reentrancy, exact payouts/rollback and no post-construction admin surface. No new final-source defect was identified during deployment preparation. The independent-human-review gate in the original plan is therefore treated under the user's established review substitution, not fabricated human approval. Specific deployment and source-publication approval has now been received; payment approval remains separate.

## Deployment-tool regression and tests

The existing deployment script accepted any nonzero token and a caller-selected chain. Added guards for exactly chain 1874 and official token 0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7, before startBroadcast. This affects the deployment tool only, not the final contract ABI or accepted bytecode.

RED tests exercised wrong-token/wrong-target configuration against the old script and failed as expected. Initial separate setEnv tests exposed shared process-environment races; use pure validateDeploymentInputs tests and one sequential run-path integration test so environment mutations cannot race each other. Both actual run-path invalid cases reject before broadcaster setup. Exact inputs pass.

Final `pnpm test:checkout`: 43 passed (35 existing final-contract tests including two 256-run fuzz tests, plus 8 smoke/deployment-tool tests). Output: docs/evidence/step-04-deploy-smoke-output.txt. No test broadcasts to Sepolia. Earlier Step 03 results remain in its report.

## Exact unsigned deployment preview

Read-only snapshot: chain 1874, block 12368552, block hash 0x76602e883f0615e1b9315a17c1cdf884edab3f525f84bda12feaf3d6f85000f5.

| Field                                  | Value                                                            |
| -------------------------------------- | ---------------------------------------------------------------- |
| Contract/source commit                 | WhitePayCheckout / 6f58f37                                       |
| Sender                                 | 0x59F5C817cF19394402DcefeBaf5796Fe7514fDed                       |
| Latest/pending nonce                   | 3 / 3                                                            |
| Predicted address (no code)            | 0x4d1761ABB4eD290F23fcDA00890039800E2e53f0                       |
| Constructor expectedChainId            | 1874                                                             |
| Constructor allowedTokens              | [0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7] — exactly one token |
| Native value / transaction destination | 0 / absent (contract creation)                                   |
| Solidity / EVM / optimizer / IR        | 0.8.24+commit.e11b9ed9 / Paris / 200 / viaIR=true                |
| Gas estimate / proposed ceiling        | 1,251,708 / 2,000,000                                            |
| Max fee / priority cap                 | 20 gwei / 0.001 gwei                                             |
| Observed gas price                     | 5.001 gwei                                                       |
| L1 data fee quote                      | 119273 wei                                                       |
| Estimated total fee                    | 0.006259791708119273 WBT                                         |
| Maximum L2 fee                         | 0.04 WBT plus variable L1 data fee                               |
| Deployer before / estimated after      | 1.69328773781587651 / 1.687027946107757237 WBT                   |

Constructor encoding was independently decoded and checked. Full init code is 7042 bytes (6914-byte base plus 128-byte args). Base hash 0x361906582dd81458dea03aa943b495ca7bf6ff6c4e4593a8de9e8826dbb962ed; complete init-code hash 0x1bd599fc11cae8d9202aa5555c774e6329c38ec686191857ef965db9edf48c10. Exact unsigned transaction hash 0xc99636245a37ff6c7352f5148eba7c245e61e6772d1ba8ab21799b01c57f26ff.

Read-only constructor execution at the current deployer nonce returns expected runtime hash 0x3a9aa44166dd8ec13f12718f9b5c4515ea494622654761b1cb26f23c6c456efd, including deployed-address EIP712 immutables. No code was persisted. Fresh checks confirm exact official proxy/implementation code and slot, six decimals, unblocked EOA roles, zero payer WBT, sufficient deployer WBT and empty predicted address. Existing encrypted deployer keystore file permissions are 0600; no contents/password read. Refresh all state before any approved signing.

Full public preview: local/ignored docs/evidence/step-04-deployment-preview.json. Source/build changes invalidate this preview; funding/deployer nonce changes also require regeneration and review. The old Step 02 creation code and nonce-2 authorization must not be reused.

## Explorer source-verification preparation

Official Whitechain documentation identifies https://explorer.testnet.whitechain.io/ as the testnet explorer: https://whitechain.io/blog/start-building-on-whitechain . Read-only GET at https://explorer.testnet.whitechain.io/api/?module=contract&action=getsourcecode&address=0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7 returned HTTP 200/API status 1 and existing TetherTokenV2 source. This validates the read API; it does not prove verification POST will succeed without authentication or claim this future contract is verified. The older sepolia.whitechain.io command templates are superseded.

Generated a standard-JSON compiler input locally using FOUNDRY_PROFILE=step03 and forge verify-contract --show-standard-json-input. This flag submitted no source. Initially --compilation-profile step03 was rejected because that option does not select a foundry.toml profile; the environment variable does. A sandbox DNS failure on the compiler version-index GET was retried with read-only network access.

All 19 source contents match artifact metadata keccak hashes; optimizer/IR/EVM/metadata settings match after normalizing Solidity defaults. Recompiled the generated input with the installed exact solc 0.8.24 binary; it reproduces the accepted base creation bytecode hash exactly. Standard input keccak256 0x54404dc56ee5e44750c23be28bc5b1f48f31a49446c873a39cedefe889df9063. Files are local/ignored: step-04-standard-input.json, step-04-verification-bundle-check.json, step-04-verification-api-read-check.json.

After explicit deployment/source-publication approval: verify actual receipt and complete runtime, publish this exact source/compiler input with the decoded constructor args, then independently query explorer status/source/compiler/args and record verification flags (including full versus partial verification). A command's exit status alone does not prove explorer verification. No API source POST has been made yet.

## Proposed separate final-contract payment

Payer currently holds 4.995 official USDT / 0 WBT; relayer 0.099029250888990698 WBT. The previous 5.005-USDT proof amount no longer fits. Propose a new positive payment of 1 USDT to merchant plus 0.001 USDT fee, total 1.001, leaving payer 3.994 and zero WBT. This uses existing funds and requires no new funding transaction.

This is a proposal only. After actual final deployment, prepare fresh orderId/quoteId/window and both signatures under WhitePayCheckout/version 1/chain 1874/actual final address, then simulate and present actual gas/calldata/fee caps for separate broadcast approval. The PoC's signatures/consumed order/nonce are not reusable. On success compare exact payer/merchant/fee/receiver deltas, relayer gas+L1 debit, final event including quoteId, settled(payer,orderId) and token authorizationState; test both replays using read-only calls.

## Current manual gate

1. Run `pnpm test:checkout` (43 passes) or focused `FOUNDRY_PROFILE=step03 forge test --root packages/contracts --match-contract DeploySmokeTest -vv` (8 passes).
2. Review constructor args, chain/sender/nonce, full init-code hash, fee limits, expected address and cost in this report/local preview.
3. Specific final deployment and public explorer source submission approval received. Recheck exact approved transaction before signing.
4. Sign only in the user's private terminal with the existing encrypted deployer keystore after fresh checks. Return only receipt/hash. Do not expose passwords/private keys.
5. Final payment requires its own reviewed terms, new signatures and broadcast approval. Milestone acceptance/commit/push follows the verified deployed-source/payment evidence and user's manual testing.

No final deployment, new payment, source publication, hosted-service change, package publication or Step 05 work performed. Step 04 preparation is uncommitted pending review; Step 03 commit 6f58f37 is already pushed.

## Specific deployment approval

User explicitly approved final checkout deployment and explorer source verification on chain 1874, nonce 3, with the displayed bytecode, constructor arguments and fee limits. Approval does not extend to payer signing or payment broadcast. Prepared `/private/tmp/whitepay-deploy-approved-checkout.sh` with pinned source/init-code/unsigned-payload/runtime hashes, nonce, chain and fee caps. Its `--check` mode is read-only; `--deploy` requires an interactive user terminal for the hidden encrypted-keystore password prompt. No wallet secret is requested in chat. Source submission follows confirmed deployment/runtime verification. No further deployment approval is needed while the exact approved transaction remains valid.

Fresh approved read-only precheck passed at block 12369509: latest/pending nonce 3, empty predicted address, exact approved source/init-code/unsigned payload and constructor runtime, official token proxy/implementation unchanged, zero payer WBT, sufficient deployer balance. Gas 1,251,708; total fee estimate 0.006259791708119273 WBT; caps unchanged. Evidence: local `docs/evidence/step-04-deployment-approved-precheck.json`. No signing or broadcast performed by assistant.

## Confirmed final checkout deployment

Transaction: https://explorer.testnet.whitechain.io/tx/0x69bda8c980dc515222d432219394ba9f7362034d6bb8ecdb8eaf28f8c8e85d95 . Successful on chain 1874, block 12369576; final address 0x4d1761ABB4eD290F23fcDA00890039800E2e53f0. Independently fetched transaction matches the exact approved unsigned payload (nonce 3, creation input, native value zero, gas limit 2,000,000, max fee 20 gwei, priority cap 0.001 gwei). Both historical and latest complete runtime hash match approved 0x3a9aa44166dd8ec13f12718f9b5c4515ea494622654761b1cb26f23c6c456efd. Constructor getters confirm expectedChainId 1874, exact official USDT allowed. EIP712 domain: WhitePayCheckout / 1 / 1874 / actual final address.

Gas used 1,240,694 at 5.001 gwei; L2 fee 0.006204710694 WBT plus L1 119297 wei = total 0.006204710694119297 WBT. Deployer block balances reconcile exactly: 1.69328773781587651 -> 1.687083027121757213 WBT. Payer WBT remains exactly zero. Public evidence local/ignored: step-04-deployment-confirmed.json.

Approved Forge source submission failed because explorer responded `{"message":"Contract verification is temporarily unavailable."}`. Independent explorer address API returns is_verified=false; smart-contract API exposes bytecode without verified source. No full/partial source verification claimed. Concise submission diagnostic: docs/evidence/step-04-source-verification-output.txt; independent API evidence: local step-04-explorer-verification-status.json. Source bundle remains available and exact compiler reproduction was checked earlier. Retry the same approved source submission when explorer service recovers; no redeployment is needed or authorized. Do not reuse the nonce-3 deployment launcher now that it is consumed.

Step 04 is incomplete pending explorer source verification, separate fresh payer signing/payment approval, live smoke evidence and manual acceptance. No payment, commit/push or Step 05 work performed.

## Final-contract payment signing preview (not approved)

User requested the next action after successful deployment. Prepared a new final-contract payment, without advancing to Step 05. At chain 1874 block 12369844, runtime, domain, expectedChainId, official token proxy/implementation code, six decimals, token allowlist, role blocklist checks, unused payer-scoped order and unused token nonce all passed. Independent on-chain orderDigest matches off-chain EIP712 encoding. No wallet was unlocked.

Proposed amount 1 USDT + fee 0.001 USDT, total 1.001. Payer 4.995 -> 3.994 USDT; merchant 5 -> 6; fee recipient 0.005 -> 0.006; receiver 0 -> 0. Payer currently exactly zero WBT and must remain so. Relayer balance 0.099029250888990698 WBT, latest/pending nonce both 1. Actual settlement gas estimate awaits valid signatures; 500,000 gas / 20 gwei / 0.01 WBT plus L1 is only an indicative budget, not a measured quote or broadcast approval.

Receiver: 0x4d1761ABB4eD290F23fcDA00890039800E2e53f0. Official token: 0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7. Order domain WhitePayCheckout/version 1/chain 1874/actual final address; token domain Tether USD/version 1/chain 1874/official token. No PoC signatures reused.

Expiry UTC: 2026-11-06T12:56:52.000Z (1793969812). Order digest/token nonce: 0xc2ac2e1018d0117d6e790bcd29525e7c9ba4d7104bb8acc693643158f24665b0. Token authorization digest: 0x3c07642c670b73430640e736ea56a2160a0efd656c02144afcb7fa08b155026a. Public local files: docs/evidence/step-04-payment-signing-preview.json, step-04-payment-order-typed-data.json and step-04-payment-token-typed-data.json. If expired, regenerate preview and obtain approval for the replacement terms/window.

Next gate: specific payer signing approval, then private encrypted-keystore signing with both signatures recovered to the expected payer and saved owner-only locally. Next simulate actual signatures, preview exact calldata/gas/nonce/fee limits, and obtain separate broadcast approval. After successful payment, test order and token replay using read-only calls. Source verification remains pending explorer recovery. No signing, payment broadcast, commit/push or Step 05 performed.

## Approved final-contract payer signing

User explicitly approved signing for 1 USDT plus 0.001 USDT fee, with displayed expiry 2026-11-06T12:56:52Z (18:26:52 IST). Same order/token digests as the preview above. Prepared `/private/tmp/whitepay-sign-approved-final-payment.mjs`: explicit final WhitePayCheckout domain, full final Order including token, hash-bound terms, chain/runtime/token code and implementation checks, unused payer-scoped order/token nonce checks, zero-WBT payer and sufficient official-USDT checks. Historical PoC config is not modified; the approved final smoke amount is explicit. 17 local signing guard tests passed, including PoC-domain substitution, fee/merchant/token tampering and invalid signature-output checks. No real wallet unlocked in tests.

User must run `node /private/tmp/whitepay-sign-approved-final-payment.mjs --sign` in their own interactive terminal, entering payer keystore password only at the hidden Cast prompts. Both recovered signers must match the approved payer; signatures are captured without printing and saved in an ignored 0700 order directory / 0600 file, with no overwrite. Return only success summary, never signatures or passwords. Expired previews fail closed. Signing approval does not approve a payment transaction; actual signature simulation and exact broadcast approval remain separate. No signing/broadcast/commit/push/Step 05 performed by assistant.

## Signed payment simulation — broadcast approval pending

User returned successful two-signature summary and authorized simulation. Both local signatures were independently recovered to the payer, typed-data digests checked against the reviewed values, exact final-contract calldata encoded and decoded (including official token), and chain/runtime/token implementation/blocklist/order/token-nonce/funding/zero-payer-WBT checks repeated. Exact settlement eth_call succeeded without state overrides. No signing or broadcast was performed.

At block 12370167: relayer latest/pending nonce 1; gas estimate 185367, proposed gas limit 500000, max fee 20 gwei, priority cap 0.001 gwei. L1 quote 10475 wei; estimated total gas debit 0.000927020367010475 WBT, leaving estimated relayer 0.098102230521980223 WBT. Maximum L2 gas debit 0.01 WBT plus variable L1 fee. Expiry remains 2026-11-06T12:56:52Z (18:26:52 IST).

Calldata hash 0x547ca9ee047790bab2e9adae1630c4142a43f096b425f6dbea946e43f888a0bf; unsigned payload hash 0x703f11701854f38c102e39679fbd08f72308c71464386a55388e11eedfbd8782. Full spending calldata stays only in ignored owner-only keystores/whitepay-sepolia/authorizations/2126655a3b012dbe012cc9193adb8a1a4461f2ed3dbcd99737cb71889cfc71e5/payment-transaction.json (0600, exclusive creation). Public report docs/evidence/step-04-payment-simulation-preview.json contains hashes and public balances only, no signatures or executable calldata. The temporary simulation tool cannot broadcast and withholds raw RPC errors.

Expected successful settlement: payer 4.995 -> 3.994 USDT / 0 WBT; merchant 5 -> 6 USDT; fee recipient 0.005 -> 0.006; receiver zero residual. These are expected outcomes, not mined effects of eth_call. After separate payment approval and confirmation, reconcile exact event including quoteId, token transfers, settlement/authorization state and relayer gas debit. Test order/token replay using read-only calls. Explorer source verification remains pending recovery; do not claim Step 04 complete. No commit, push or Step 05.

## Specific final payment broadcast approval

User explicitly approved final checkout payment: 1 USDT + 0.001 USDT fee, chain 1874, relayer nonce 1, displayed calldata hash, expiry and fee limits. Approval binds calldata hash 0x547ca9ee047790bab2e9adae1630c4142a43f096b425f6dbea946e43f888a0bf and unsigned payload hash 0x703f11701854f38c102e39679fbd08f72308c71464386a55388e11eedfbd8782; 500000 gas limit, maxFee 20 gwei, priority cap 0.001 gwei, value zero, receiver final checkout. Expiry remains 2026-11-06T12:56:52Z. No terms/nonce/expiry renewal is authorized automatically.

Prepared `/private/tmp/whitepay-send-approved-final-payment.mjs` with --self-test, --check and private-terminal --send modes. Twelve transaction tamper/time guards pass. Revalidates full approved serialized transaction and decoded terms, both recovered signatures, chain/runtime/token implementation, unused payer/order/token nonce, current relayer latest/pending nonce, blocklists, balances, zero payer WBT, current gas/fees and fresh exact settlement simulation. Checks owner-only transaction file/directory and encrypted relayer keystore metadata; no keystore contents opened by assistant. Raw errors/signatures/calldata are withheld. User enters relayer password only in their private interactive terminal. No additional payment approval is needed if all exact approved fields remain valid. If Cast fails or is interrupted, check transaction status before any retry.

No payment broadcast by assistant. After user returns receipt/hash, independently verify exact transaction, receipt/events, state and historical balance deltas, gas/L1 debit, and both replay rejection paths via read-only calls. Source verification remains pending explorer recovery; no commit/push or Step 05 authorized.

## Confirmed final checkout live payment and replay proof

Payment receipt: https://explorer.testnet.whitechain.io/tx/0x866f70f7b80f2e5e2766e7b2782b86c85f33f61754dbb00daa11ad55e50d90be . Status success on chain 1874, block 12370345. Independently fetched mined transaction matches exact approved sender, receiver, nonce 1, zero native value, full calldata hash, unsigned payload hash, gas limit and fee caps. Final runtime unchanged. PaymentSettled event matches every order field including quoteId; AuthorizationUsed and all three exact official-USDT Transfer logs match expected routing.

| Role          | Official USDT before | Official USDT after | WBT result                                   |
| ------------- | -------------------- | ------------------- | -------------------------------------------- |
| Payer         | 4.995                | 3.994               | Exactly 0 before, after and latest           |
| Merchant      | 5                    | 6                   | 0                                            |
| Fee recipient | 0.005                | 0.006               | 0                                            |
| Checkout      | 0                    | 0                   | 0                                            |
| Relayer       | 0                    | 0                   | 0.099029250888990698 -> 0.098233141698979925 |

Gas used 159190 at 5.001 gwei; L1 fee 10773 wei; exact total 0.000796109190010773 WBT. Historical block balances reconcile exactly with relayer gas debit and the payer/merchant/fee/receiver token deltas. Local public evidence: docs/evidence/step-04-payment-verified.json. No signatures or raw executable calldata are included.

Both replay checks passed within the original authorization window using eth_call only: identical settlement rejects OrderAlreadySettled; direct official-token authorization from receiver origin rejects TetherToken: auth invalid. settled(payer,orderId) and authorizationState(payer,orderDigest) are true. Balances and relayer nonce unchanged around replay checks; zero replay transactions broadcast.

The already approved explorer source verification was retried with identical compiler/settings/constructor args and again rejected with Contract verification is temporarily unavailable. Diagnostic: docs/evidence/step-04-source-verification-retry-output.txt. Contract is deployed and operating, but do not claim verified explorer source or complete Step 04. No redeployment needed; do not rerun consumed payment/deployment commands.

### Manual acceptance checks (read-only)

1. Open the final deployment and payment receipts above in the official explorer; verify status success, sender/receiver, official token and exact payouts.
2. Run the commands below from repository root, confirming payer native balance 0 wei, payer official USDT 3994000 minor units, merchant 6000000 and fee recipient 6000.
3. Read the settlement flag using the payer and exact orderId; it must be true. Inspect the final event including quoteId and compare this table.
4. Review that explorer source remains unverified because its verification service is unavailable. Step 04 cannot meet its original source-verification acceptance gate until that service recovers, unless the user explicitly changes that gate.

```bash
cast balance 0x9AfB652bB337eB4D5a09221Af7972D69B500e035 --rpc-url https://rpc.testnet.whitechain.io
cast call 0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7 'balanceOf(address)(uint256)' 0x9AfB652bB337eB4D5a09221Af7972D69B500e035 --rpc-url https://rpc.testnet.whitechain.io
cast call 0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7 'balanceOf(address)(uint256)' 0xB5bd941E218c88707a2BbABEb3cb0BDbE1543c9C --rpc-url https://rpc.testnet.whitechain.io
cast call 0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7 'balanceOf(address)(uint256)' 0x2F51C76D37BA9118ce8D5b9377329965ddb411c2 --rpc-url https://rpc.testnet.whitechain.io
cast call 0x4d1761ABB4eD290F23fcDA00890039800E2e53f0 'settled(address,bytes32)(bool)' 0x9AfB652bB337eB4D5a09221Af7972D69B500e035 0x2126655a3b012dbe012cc9193adb8a1a4461f2ed3dbcd99737cb71889cfc71e5 --rpc-url https://rpc.testnet.whitechain.io
```

No additional signing, funding, token approval, transaction, commit, push or Step 05 work is authorized by these read-only checks. Await user manual review; retry only the already approved source verification when service recovers.
