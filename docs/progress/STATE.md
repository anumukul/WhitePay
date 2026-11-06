# WhitePay implementation state

Last approved implementation step: 02 — genuine live zero-WBT official-USDT proof
Current step: 02 — genuine zero-WBT live proof verified
Status: APPROVED — user explicitly accepted Step 02 and authorized its evidence commit/push to origin/main

Live payment: 0x93b866b4855b0fe05a86578ecbebe174671417c809c8598822fb04a3623c4641, chain 1874, block 12366248, exact approved relayer nonce-0 payload. Payer 10 → 4.995 official USDT with exactly zero WBT before/after/latest. Merchant +5 USDT; fee recipient +0.005 USDT; receiver zero residual. Relayer 0.1 → 0.099029250888990698 WBT; exact total fee 0.000970749111009302 WBT (194111 gas at 5.001 gwei plus L1 9302 wei). Both order replay (OrderAlreadySettled) and token nonce replay (TetherToken: auth invalid) rejected through read-only calls, with zero extra broadcasts.

Current branch: main
Reviewed handoff base: d70b519 (teammate API/chain/relayer/worker integration; pulled after 6da644f)
Current implementation report: docs/progress/step-02.md
Authorized remote: https://github.com/anumukul/WhitePay.git
Git policy: user explicitly approved Step 02 and its reviewed evidence commit/push to origin/main. Later milestones still require manual testing/approval before commit/push; deployments/payments require separate exact transaction approval. No Step 03 implementation is authorized by the evidence publication.
Configured remote branch: origin/main
Step 01 code/evidence commit: 013a87b — pushed to origin/main
Step 01 review transition: user authorized Step 02 after receiving manual testing instructions.
ADR 0001: experimental PoC evaluated in Step 02; final interface approval pending

## Resumption plan after teammate handoff

Preserve and review the existing implementation. Code presence or reported mock-test success does not complete a milestone. Step 02 is now manually accepted; later code is available for reuse but remains unaccepted. Each row requires manual user testing before its commit/push. Onchain transactions, deployments, publication, and other external writes retain their separate exact-preview approval gates.

| Step  | Work to complete using the existing code                                                                                                                               | Manual acceptance before approval                                                                                                                                                               |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 02    | Repair PoC tooling integration; refresh actual funding; complete the approved experimental zero-WBT proof with official USDT.                                          | Verify payer WBT remains zero, exact merchant/fee credits, relayer gas debit, successful receipt and replay rejection. Funding, deployment and payment each require their own preview/approval. |
| 03    | Review existing final checkout contract and ABI against the proven PoC; repair demonstrated defects with regression tests; obtain second teammate security signoff.    | Inspect signed terms, decoded event, tamper/replay/expiry rejection and documented privileges.                                                                                                  |
| 04    | Refresh final deployment estimate, approve/deploy/verify source, and separately approve the official-token live smoke payment.                                         | Explorer source/runtime/constructor match, exact balances and replay rejection.                                                                                                                 |
| 05    | Finish API/data acceptance: decide and record SQLite-to-Postgres migration, versioned migrations, schemas, price/order immutability, auth/isolation and quote renewal. | Two merchants create/retrieve sessions; cross-merchant access and changed/expired terms fail; migrations recover cleanly.                                                                       |
| 06    | Fix independent quote validation, actual transaction fee caps including L1 fee accounting, durable queue claiming, nonce/restart recovery and receipt reconciliation.  | Invalid input never broadcasts; approved payment survives worker restart within configured spend limits.                                                                                        |
| 07    | Fix event processing crash recovery and full order/log reconciliation; implement transactional webhook outbox, delayed retries and replay protection.                  | Restart between persistence/delivery, retry a failed webhook, reject mismatched events, fulfill duplicate deliveries once.                                                                      |
| 08    | Complete Node SDK interfaces/errors/timeouts and package checks against the reviewed API.                                                                              | Install a tarball in a fresh independent Node app, create/retrieve a real session and verify webhook signature/freshness.                                                                       |
| 09    | Build the missing hosted checkout and public session authorization path; add wallet connection, both signatures, price/fee disclosure and settlement status.           | Independent React app completes official-USDT checkout with zero payer WBT; rejection, expiry and wrong-chain cases are usable.                                                                 |
| 10    | Extend the existing payments dashboard with products/prices, orders/receipt links, API-key and webhook management.                                                     | Two merchant accounts remain isolated; settings and versioned prices work.                                                                                                                      |
| 11–12 | Locate/review teammate demo branch if available, otherwise implement the two independent integrations after their dependencies pass.                                   | SaaS credits and shop entitlement unlock only after verified payment; duplicate/forged callbacks do not duplicate fulfillment.                                                                  |
| 13    | Implement deployment artifacts and persistent DB/worker configuration behind the existing runbook; approve actual hosting separately.                                  | Public HTTPS checkout works from another device and survives service restart.                                                                                                                   |
| 14    | Add the docs site and compiled quickstart; validate tarballs; obtain separate publication approval.                                                                    | A fresh developer completes integration using only published docs/packages.                                                                                                                     |
| 15    | Correct existing landing-page claims; add the planned deck and working links.                                                                                          | All claims and CTAs match actual deployed evidence.                                                                                                                                             |
| 16    | Expand the small adversarial suite to the plan's security, recovery, quota and performance cases.                                                                      | Independent teammate review, fault/replay cases and secret exposure checks pass.                                                                                                                |
| 17    | Complete qualification evidence and demo rehearsal using the existing script.                                                                                          | Actual demo/video, verified contract and real payment links satisfy the submission checklist.                                                                                                   |

Immediate repair: the added production deployment script imports `src/WhitePayCheckout.sol`, which the default Foundry profile also compiled during Step 02 commands. That broke preflight with stack-too-deep before RPC checks. The default PoC profile now has its own script directory and the Step 03 profile explicitly retains `script/`. The initial failing preflight is recorded; `pnpm test:poc` now passes 10/10. The rebuilt read-only preflight reached RPC but exited 1 with `HTTP request failed`; no fresh balance or chain confirmation is claimed. Local output: `docs/evidence/poc-preflight-resume.json` (ignored). Next manual check: rerun Step 02's preflight from the user's terminal and inspect its public output before preparing any funding/deployment transaction.

Earlier entries below retain the historical evidence and approval sequence; this resumption plan supersedes their stale current-status statements.

Verified findings:

- Live official-token receipt: one matching PaymentSettled, three exact USDT Transfer logs and one matching AuthorizationUsed log; exact historical balance and fee reconciliation passed.
- Corrected PoC at 0x6ae4Ee53ac2b98ADf9EF89d03500848bC8405F45; deployment tx 0x3d972265aaa0dbfd05a7a6c63896564b80c2fc2c6deb8029bf421ae5f8057ac8. Full runtime independently matches historical constructor execution including domain immutables; source commit 64c5aa9.
- Payer-scoped settled getter and token authorizationState are true for the paid order/digest. Read-only replay fails for the intended reasons.
- Latest local checks: 28 root Node tests, 10 PoC tests and 11 official-token fork tests passed. Full formatting still has 63 inherited issues. User substituted AI review for unavailable teammate review.

Manual acceptance received: user replied APPROVE STEP 02 AND COMMIT/PUSH TO origin/main. Publish only the reviewed Step 02 public evidence/docs and local-artifact ignore rule. No more payment/replay transactions are needed. After the authorized push, STOP before Step 03; the user must request its start.

Known limits/follow-up: final WhitePayCheckout remains affected by R-01 and needs its own correction/review; offchain services and wallet UX remain prototypes; no explorer source publication or Ethereum-finality claim is made. Payer's remaining 4.995 USDT is below the default 5.005-USDT proof amount; do not rerun payment/signing launchers or infer that another payment is funded/approved. Prior trading-wallet approvals remain, with no revocation authorized.

Historical Step 02 preparation and funding snapshots (superseded by current live result above):

Step 02 local preparation:

- Latest recorded checks: 26 Node tests, 10 mock-based Foundry tests, and 6 official-token fork tests passed.
- Fork funding/minting is synthetic and local; no onchain payment or relayer gas evidence.
- Public config preflight refuses empty addresses and unfunded fixtures.
- Second-teammate security review and explicit deploy/payment consent still required.

Wallet-setup follow-up:

- User requested secure local wallet-creation guidance and explicitly prohibited all broadcasts/deployments without specific approval.
- Added encrypted-keystore public metadata export, explicit payer balance checks, and a read-only deployment/L1-fee quote tool.
- User created and privately verified all five encrypted keystores; the assistant created/decrypted none. Public-address export still pending.
- Read-only example deployment quote: 1,283,551 gas, about 0.00641904 WBT including quoted L1 fee at observed 5.001 gwei. Actual signer/nonce quote pending.
- Official WBT funding is documented; exact official USDT funding still requires verified DevRel/holder assistance.
- Guide: docs/runbooks/step-02-wallets.md. No commit, push, or Step 03 authorized.

Wallet helper follow-up checks: 16 Node tests passed; lint/typecheck/diff checks passed. User-wallet balances remain UNVERIFIED until local creation/public config.

Wallet-config regression:

- Actual Foundry files omit address metadata (only crypto/id/version, v3, 0600).
- Added explicit prefix normalization, derived-public manifest fallback, mismatch/duplicate validation, and user-terminal Cast public-address exporter.
- RED: four new regression failures; GREEN: 23 Node tests passed with end-to-end public-only output checks.
- Actual wallet-config and initial preflight safely remain blocked until private-terminal public-address export; real five-address matching and RPC balances are not yet verified by assistant.
- Current report: docs/progress/step-02-wallet-config-fix.md. No commit, push, onchain writes, or Step 03.

Public-wallet review completed:

- User ran private-terminal exporter, wallet-config, and initial preflight.
- All five distinct normalized addresses match the exporter manifest, public config, initial evidence, and fresh read-only RPC snapshot.
- Fresh RPC snapshot: chain 1874, block 12307110; all five wallets hold 0 WBT and 0 official USDT. None is blocklisted or has contract code.
- Payer WBT exactly 0 confirmed. Payer USDT is insufficient: needs at least 5.005 (default amount 5 + fee 0.005).
- Only expected funding blockers remain: payer USDT, deployer WBT, relayer WBT. Review evidence: docs/evidence/poc-wallet-review.json.
- Recommended funding buffer: 0.10 test WBT each for deployer/relayer; request 10 official USDT for payer, with no WBT sent to payer.
- No keystores opened in this review; no funding, deployment, broadcast, Git action, or Step 03 performed.

Relayer funding preview — awaiting specific approval:

- Read-only RPC snapshot block 12307642 on chain 1874 independently confirmed deployer 2 WBT, relayer 0 WBT, payer 0 WBT.
- Deployer latest/pending nonce both 0; sender and recipient have no contract code. Addresses match explicit user request, public config and Cast-derived manifest.
- Proposed native transfer: exactly 0.10 WBT deployer → relayer, empty data, nonce 0, estimated/limited gas 21,000, EIP-1559 maxFeePerGas 20 gwei, priority cap 0.001 gwei.
- Estimated total fee 0.00010502100000308 WBT (includes current L1 quote); L2 fee cap 0.00042 WBT plus variable L1 data fee.
- Encrypted deployer keystore path/0600 permission verified without reading/decrypting its contents. No signing or broadcasting performed.
- Preview: docs/evidence/relayer-funding-preview.json. Revalidate before any approved action; actual signing must keep the password in the user's private terminal.
- No checkout deployment, commit/push, or Step 03 authorized.

Relayer transfer specifically APPROVED by user:

- User approved the exact 0.10 WBT deployer-to-relayer transfer on chain 1874 with nonce 0, gas 21,000, max fee 20 gwei, priority cap 0.001 gwei.
- Final read-only recheck at block 12307818 passed: deployer 2 WBT, relayer 0 WBT, latest/pending nonce 0, gas estimate 21,000, estimated fee 0.00010502100000308 WBT including current L1 quote.
- Evidence: docs/evidence/relayer-funding-approved-precheck.json.
- Status: APPROVED — waiting for user-private terminal keystore signing/broadcast. Assistant has not unlocked a wallet or sent a transaction. No further transfer approval is needed if the exact approved fields remain valid.
- Next: user runs the exact approved Cast command with hidden local password prompt, supplies only transaction hash; assistant verifies receipt and both native balances. Never request password in chat.
- No checkout deployment, Git mutation, or Step 03 authorized.

APPROVED relayer funding transfer VERIFIED:

- Transaction 0x42f193df0f084dc6ed8a2b7ae1c364315c5ae8263065fc7e1a88539b5b2604db succeeded on chain 1874 at block 12307940. Actual transaction matches the approved unsigned payload exactly, including sender, recipient, value 0.10 WBT, nonce 0, empty input, 21,000 gas limit and both fee caps.
- Deployer: 2 → 1.89989497899999676 WBT. Relayer: 0 → 0.10 WBT. Payer WBT remains exactly zero before/after/latest query.
- Actual total fee 0.00010502100000324 WBT: L2 0.000105021 WBT plus reported L1 fee 3240 wei. Historical balance deltas reconcile exactly.
- Evidence: docs/evidence/relayer-funding-verified.json. Canonical successful L2 receipt verified; Ethereum finality not asserted.
- Native funding is complete. The nonce-0 contract-address prediction in old preflight files is now stale: funding consumed nonce 0. Regenerate deployment preview using the current nonce before any deployment approval.
- Next unresolved proof prerequisites: verify sufficient official payer USDT, teammate source review, and separate explicit deployment/payment approval. No deployment, commit/push, or Step 03 performed.

YetiTrade funding plan update — READY_FOR_REVIEW:

- User reports DevRel recommended https://testnet.yetitrade.fi/ for exact official USDT acquisition.
- Verified chain-1874 app token list, published router address, actual router runtime against explorer source, factory pools, and independent QuoterV2 output for sample native WBT route.
- Sample: 0.15 WBT → 11.028196 official USDT; encoded minimum 10.973329 at 0.5% slippage. Native calldata wraps inside router and requires no ERC-20 approvals.
- Synthetic-balance-only swap estimate 256,688 gas; sample token transfer estimate 61,736 gas. Actual wallet quotes/allowances/gas remain to be reviewed after its public address is supplied.
- Propose a separately approved 0.20 WBT trading-wallet top-up, then separate swap approval and separate 10-USDT transfer approval. No new wallet created, funding transfer, approval, swap, token transfer, deployment, Git action or Step 03.
- Current payer still 0 WBT / 0 USDT at read-only check. Guide: docs/runbooks/step-02-yetitrade-funding.md. Evidence: docs/evidence/yetitrade-funding-preview.json.
- No longer blocked solely on DevRel supplying a faucet: a swap quote/path exists. Blocked on actual temporary-wallet setup and per-transaction approvals before execution.

Temporary trading wallet funding preview — awaiting explicit approval:

- User supplied dedicated public address 0xeBd86998e8C765F92CC5022ff94eB093eFCFa8a4. Checksum valid; distinct from all five WhitePay roles; no recipient contract code.
- Independent chain 1874 snapshot at block 12310328: deployer 1.89989497899999676 WBT, trading wallet 0 WBT, payer 0 WBT. Latest/pending deployer nonce both 1.
- Proposed exact transfer: 0.20 WBT, empty input, nonce 1, 21,000 gas, max fee 20 gwei, priority cap 0.001 gwei.
- Estimated total fee 0.00010502100000356 WBT including current L1 quote; L2 ceiling 0.00042 WBT plus variable L1 fee. Expected deployer 1.6997899579999932 WBT, trading wallet 0.20 WBT.
- Preview docs/evidence/trading-wallet-funding-preview.json; only keystore path/type/0600 permissions checked, no contents opened or signing attempted.
- No funding broadcast, swap, approval, USDT transfer, deployment, commit/push, or Step 03. Refresh YetiTrade quote only after approved funding and receipt verification.

Trading funding transfer specifically APPROVED:

- User approved 0.20 WBT deployer → 0xeBd86998e8C765F92CC5022ff94eB093eFCFa8a4, chain 1874, nonce 1, gas 21,000, max fee 20 gwei, priority cap 0.001 gwei.
- Final read-only checks at block 12310449 passed. Latest/pending nonce both 1; deployer 1.89989497899999676 WBT; trading wallet 0 WBT; 21,000 gas estimate.
- Refreshed total fee estimate 0.00010502100000468 WBT includes current L1 quote (4680 wei); L1 amount remains variable within previously disclosed terms.
- Evidence: docs/evidence/trading-wallet-funding-approved-precheck.json.
- Status: approved; waiting for user-private terminal Cast signing and broadcasting. Assistant has not unlocked or broadcast. Next: verify actual transaction/receipt/balances, then prepare a fresh YetiTrade quote for separate review; no swap or token-transfer approval inferred.
- No deployment, commit, push, or Step 03 authorized.

Trading wallet native funding VERIFIED:

- Approved transaction 0xf170b0f3d39d7b638a6688fd1398b2e2d7364df47294fa2f31c62f1bc07aafda succeeded on chain 1874. Exact approved unsigned payload matched (0.20 WBT, deployer → trading wallet, nonce 1, empty data, 21,000 gas, max fee 20 gwei, tip cap 0.001 gwei).
- Deployer 1.89989497899999676 → 1.69978995799999224 WBT; trading wallet 0 → 0.20 WBT. Total fee 0.00010502100000452 WBT; reported L1 fee reconciles with historical balance debit.
- Evidence: docs/evidence/trading-wallet-funding-verified.json. Funding consumed deployer nonce 1; older deployment predictions must be refreshed before any deployment approval.

Fresh actual-wallet YetiTrade preview — awaiting separate approval:

- Trading wallet 0xeBd86998e8C765F92CC5022ff94eB093eFCFa8a4 holds 0.20 WBT / 0 USDT. Payer remains 0 WBT / 0 USDT.
- Native input 0.15 WBT; quote 11.023732 official USDT; encoded minimum 10.968887, 0.5% slippage, output to trading wallet. Quote expires 2026-11-05T19:38:27.272222883Z.
- Actual-wallet simulation passed without state overrides. Estimated gas 263,697; proposed gas ceiling 350,000, max fee 20 gwei, priority cap 0.001 gwei, trading nonce 0. Estimated total fee 0.001318748697009102 WBT including L1 quote; max L2 fee 0.007 WBT plus variable L1 fee.
- Factory pools, independent QuoterV2, exact output token/decimals, router runtime and decoded native calldata all verified. WWBT and USDT allowances to Permit2 are zero; reviewed native route requires no ERC-20 approval.
- Evidence: docs/evidence/yetitrade-trading-wallet-swap-preview.json. Quote must still be unexpired/valid when signing; if changed or expired, refresh and review new terms. No swap or USDT-transfer approval received.
- No swap, token approval, USDT transfer, deployment, commit/push or Step 03 performed.

Refreshed swap final-review preview — NOT APPROVED:

- User accepted the proposal in principle but explicitly required a fresh quote and final approval before any swap.
- Evidence: docs/evidence/yetitrade-final-swap-preview.json. Chain 1874 at block 12310821; trading wallet 0.20 WBT / 0 USDT, latest/pending nonce 0; payer 0 WBT / 0 USDT.
- Exact input 0.15 native WBT; quoted output 11.023732 official USDT; encoded minimum 10.968887 at 0.5% slippage. Recipient is the isolated trading wallet; router is the published Universal Router.
- Encoded deadline 1793907789 (06/11/2026, 01:13:09 IST). New unsigned payload hash 0x95bc6d8b0ac8d88f4d9e7dd520f7fe3e4f174573eeca2ffa554f15d81b885a89.
- Verified actual calldata commands/recipient/path/minimum/deadline and absence of partner/allow-failure operations; source/runtime and canonical factory pools match; independent QuoterV2 output matches.
- Actual-wallet simulation (no overrides) passed at 263,697 gas. Proposed limit 350,000; max fee 20 gwei, priority cap 0.001 gwei. Estimated fee 0.001318748697007368 WBT including current L1 quote; L2 ceiling 0.007 WBT plus variable L1 fee.
- No ERC-20 approval is needed. Isolated wallet signing remains private and pending explicit final swap approval. After confirmed swap, prepare a separate 10-USDT transfer for another approval.
- No transaction signed/broadcast, no deployment, commit, push, or Step 03.

Exact refreshed swap APPROVED by user:

- User approved the stored 0.15 WBT swap, minimum 10.968887 official USDT, chain 1874, nonce 0, exact displayed deadline 1793907789 and fee limits.
- Read-only recheck at block 12310991 passed: balance 0.20 WBT, latest/pending nonce 0, gas estimate 263,697; deadline remained valid. Saved docs/evidence/yetitrade-approved-swap-precheck.json, bound to the approved unsigned payload hash.
- Prepared user-private browser-wallet signing launcher scripts/poc/send-approved-yeti-swap.mjs. It pins the approved transaction, revalidates RPC state, refuses near/expired deadline, and invokes Cast --browser --browser-disable-open. No secret/key import or keystore decryption; user must open the displayed local URL in the isolated trading profile and confirm there.
- Launcher has not been run by assistant; no transaction signed or broadcast. Syntax check and existing three quote validation/tampering tests passed. Current restrictions remain: no token transfer, deployment, commit/push, or Step 03.
- After user executes only the exact approved swap, verify receipt and balances, then prepare a separate 10-USDT transfer for another approval.

Browser-launcher handoff did not complete; user requested direct wallet UI:

- Read-only check at block 12311443: trading latest/pending nonce both 0, 0.20 WBT / 0 official USDT; payer WBT still 0. No mined or pending swap observed.
- The specifically approved deadline 1793907789 (01:13:09 IST) has passed. Do not execute or silently refresh that approval.
- User should cancel the old terminal process and any wallet request, then prepare a fresh YetiTrade UI quote with the isolated trading wallet. Stop at confirmation for review of the new quote/minimum/calldata/gas before a fresh explicit approval.
- No swap, token transfer, deployment, commit/push or Step 03 performed.

User-executed YetiTrade UI swap VERIFIED:

- Swap 0xf80c7700eb3ed402155cd82cd482a91973b5696434ca911ecc52be338ed2df0c succeeded on chain 1874 and credited exactly 11.019904 of required official USDT to trading wallet.
- User executed four transactions independently: WWBT approval nonce 0, Permit2 approval nonce 1, wrap 0.15 WBT nonce 2, router swap nonce 3. Actual path differs from the old native-input preview; no claim that old exact calldata/approval matched these UI transactions.
- Actual encoded minimum 10.803827 USDT (lower than reviewed 10.968887). Actual received amount exceeded both. Do not assert that the UI used reviewed 0.5% slippage solely from the mined output.
- UI left unlimited ERC20 WWBT→Permit2 allowance and maximum uint160 Permit2→router allowance. These are actual remaining approvals, not automatically revoked. WWBT balance currently zero. Cleanup/revocation requires a separate preview and approval.
- Trading balance: 0.048655711195984281 WBT / 11.019904 USDT / 0 WWBT; payer: 0 WBT / 0 USDT. Four fees total 0.001344288804015719 WBT and reconcile with the wrapped-native debit.
- Evidence: docs/evidence/yetitrade-ui-swap-verified.json. Successful canonical L2 receipts checked; Ethereum finality not asserted.

Separate 10-USDT payer funding preview — awaiting explicit approval:

- From trading wallet; transaction target exact official token, call transfer(payer, 10000000), native value 0, nonce 4 (latest/pending match), estimated gas 61,736 / proposed limit 80,000, max fee 20 gwei, tip 0.001 gwei.
- Estimated total fee 0.00030874173600326 WBT including L1 quote; L2 ceiling 0.0016 WBT plus variable L1 fees. No allowance needed for this own-token direct transfer.
- Expected payer 10 USDT / 0 WBT; trading 1.019904 USDT and approximately 0.048346969459981021 WBT.
- Evidence: docs/evidence/trading-to-payer-usdt-transfer-preview.json. No transfer submitted, approval changed, deployment, commit/push, or Step 03.
