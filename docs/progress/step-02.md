# Step 02 — Genuine zero-WBT authorization proof

STEP: 02 — Local proof prepared; live proof incomplete

STATUS: INCOMPLETE — funding setup verified; live WhitePay deployment/payment not performed

## Current implementation snapshot

- Added an experimental EIP-712/EIP-3009 receiver that atomically splits official USDT between merchant and fee recipient, checks exact balance deltas, prevents order replay, and rejects unsupported payer/token/chain cases. It is not deployed and its ABI is not approved as the final product interface.
- Added Foundry mock tests and official-token fork tests, plus Node tests for the public order planner, wallet metadata/config validation, and YetiTrade quote/call-data verification.
- Added public-address-only wallet configuration/export, read-only chain/balance preflight, and deployment gas estimation. Keystore passwords and private material stay in the user's local terminal; generated wallet and transaction JSON is ignored by Git.
- Latest recorded verification: 26 Node tests, 10 mock-based Foundry tests, and 6 official-token fork tests passed; lint, typecheck, and build also passed at that checkpoint.
- Added wallet and YetiTrade funding runbooks. The isolated trading wallet's UI swap was verified to yield 11.019904 of the exact official USDT. Its approvals remain as recorded in the local evidence. The separate 10-USDT transfer to the payer is only prepared; no verified payer credit is recorded here.
- No WhitePay contract deployment, live checkout, relayer-paid payment gas, or onchain replay-rejection proof exists. Step 02 remains incomplete; Step 03 has not started.

Implementation details, test history, transaction evidence, known deviations, and next approval gates are maintained in this report below and in the referenced runbooks. Do not treat old “awaiting funding” notes as current state where this snapshot supersedes them.

## Scope completed

Experimental receiver, local/fork tests, two-signature order planner, and read-only public-address/balance/deployment preflight. No Step 03 final checkout implementation or product work begun.

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
