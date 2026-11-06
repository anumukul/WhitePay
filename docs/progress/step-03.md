# Step 03 — Core checkout contract

STATUS: APPROVED — user reported manual checks successful and requested proceeding to Step 04. Publish reviewed Step 03 source/tests/docs under the agreed commit/push workflow. No final-contract deployment or Sepolia transaction is authorized by this acceptance.

## Scope and interface

Continue the teammate implementation from approved Step 02 commit 5fec28d. The accepted live proof used WhitePayAuthorizationPoC; this step reviews WhitePayCheckout as a separate candidate. User requested moving to Step 03; later milestones remain outside this approval.

- Correct R-01 in the final contract: `settled[payer][orderId]`, checked and marked consistently before token calls. Another payer may reuse an ID without blocking its intended payer; the same payer/ID cannot settle again with changed quote terms or fresh signatures.
- Public getter changes from `settled(bytes32)` to `settled(address,bytes32)`. Update `@whitepay/chain` ABI, `isSettled(payer, orderId)` and all existing callers/tests. A compiled-artifact comparison guards the chain package's function/event ABI against drift.
- Signed Order fields stay unchanged: orderId, payer, merchant, amount, fee, feeRecipient, token, validAfter, validBefore, quoteId. Token authorization nonce equals the EIP-712 order digest. Domain is WhitePayCheckout/version 1/actual chain and receiver; PoC signatures are not reused.
- Constructor remains `(uint256 expectedChainId, address[] allowedTokens)`. Single official USDT on chain 1874 is the intended MVP deployment configuration; the constructor is parameterized and does not itself hardcode that configuration. Step 04 must separately verify exact constructor args, code hashes and chain before approval.
- Event remains `PaymentSettled(bytes32 indexed orderId,address indexed payer,address indexed merchant,address token,uint256 amount,uint256 fee,address feeRecipient,bytes32 quoteId)`.
- No admin mutators, proxy, withdrawal or ownership surface added. Allowed tokens are set only in the constructor. Buyer signs all economic terms; this contract does not enforce merchant catalog pricing or independently validate a server quote. API/relayer/indexer must reconcile authoritative price/recipient/fee/quote terms in later milestones.

## TDD evidence

1. Baseline: 20 teammate contract tests plus 4 deployment-fixture smoke tests passed.
2. RED: new copied-ID regression failed with `OrderAlreadySettled`; same-payer/new-terms replay test already passed. This reproduced R-01 in the final candidate independently of the PoC.
3. Fix: nested payer-scoped mapping, both state accesses updated, Solidity smoke/getter readers updated.
4. RED in chain reader: local Anvil run produced 11 passes / 2 failures, showing old one-argument ABI and bytes20-as-bytes32 encoding. Updated ABI and method to require payer; subsequent ABI/artifact and read tests pass.
5. Strengthened coverage: exact event including quoteId, permitted-token substitution signature rejection, remaining signed-field tampering, wrong-chain signatures on the correct runtime chain, malformed signatures, invalid roles/identifiers/windows, checked total overflow, insufficient funds, malicious short merchant/fee payouts, zero fee, reentrancy, full rollback and replay.
6. Replaced the unused misleading mock balance override with an actual short-payout mode exercised by tests. Added a second 256-run fuzz test for payer isolation and strengthened conservation fuzz with receiver balance, nonce/settled state and replay assertions.

Final automated results:

| Check                                        | Result                                                                                                |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `pnpm test:checkout` / `pnpm test:contracts` | 39 passed: 35 contract tests including two 256-run fuzz tests, plus 4 local deployment smoke fixtures |
| `pnpm test:checkout:fork`                    | 11 passed against exact official token state at pinned block 12300809, entirely local execution       |
| `pnpm --filter @whitepay/chain test`         | 14 passed against local Anvil, including compiled ABI correspondence                                  |
| `pnpm --filter @whitepay/chain typecheck`    | Passed after preserving viem chain/transport generics in client fields                                |
| `pnpm test`                                  | 28 root Node tests passed                                                                             |
| `pnpm test:poc`                              | 10 passed; accepted experimental receiver source untouched                                            |

Outputs: `docs/evidence/step-03-forge-output.txt` (includes gas report), `step-03-fork-output.txt`, `step-03-chain-output.txt`. Fork funding/minting and Anvil deployments/transfers use synthetic local accounts only. They are not additional Sepolia transactions or final-checkout deployment evidence. The existing PoC live payment remains the only accepted Step 02 proof.

Scoped Solidity/Prettier formatting and whitespace checks pass. Full `pnpm lint` still exits 1 for 58 unchanged teammate source files; zero changed source files are flagged. Added Step 03 build/cache/vendor directories to `.prettierignore` so generated dependencies/artifacts are not linted as project source. No source directory or new source rule was excluded. Independent final-contract human review is not claimed by these checks.

## Reproducible build and prerequisite repairs

Pinned Solidity 0.8.24, Paris, optimizer 200, viaIR=true, OpenZeppelin 5.4.0. Existing default PoC profile remains separate. Added opt-in `step03fork` for final checkout fork tests. Existing vendoring copies the pinned root dependency into ignored contract lib; no vendored dependency committed. `test:contracts` now runs implemented final-contract tests instead of the old unavailable placeholder.

Candidate source SHA-256: `37c440f166e04dd646a1b4c551115b7d0fd7a7b043abae889f6a9bbc56cba3a5`. Base creation bytecode is 6914 bytes, keccak256 `0x361906582dd81458dea03aa943b495ca7bf6ff6c4e4593a8de9e8826dbb962ed`. This excludes constructor arguments and is not a deployment transaction hash; deployment-specific calldata/nonce/runtime comparison belongs to Step 04 after approval.

The teammate added workspace manifests without lockfile importers. Reconciled the lockfile to the existing declared dependencies so a frozen install works; no package version or framework was changed. Initial no-TTY install aborted before mutation; initial offline-only frozen install lacked a cached viem tarball. Network-backed `CI=true pnpm install --frozen-lockfile --ignore-scripts` completed successfully for all 10 workspaces. Package install scripts were disabled. Initial sandboxed Anvil could not bind a local socket; its outside-sandbox retry reached the intended RED and later GREEN.

The updated client had an existing viem `PublicClient` type mismatch when typecheck was first run. Explicit chain/transport generics fix this without suppressing errors. Full product build, all service tests and end-to-end browser tests are not implied by these scoped checks.

## Source review and remaining boundaries

AI source review after correction confirms chain guard, token allowlist, signature binding, consistent payer/ID namespace, marking-before-external-call, reentrancy guard, SafeERC20 transfers, exact balance checks and atomic rollback. Official-token fork verifies real token signatures, domain, receiver-only authorization, token nonce consumption, exact event/payouts and rollback. A short/false payout cannot silently settle. Anyone may submit an unchanged valid signed order; it still pays the signed recipients once. No fund redirection or remaining contract blocker was found in these reviewed cases.

Limitations: EOA signatures only (no ERC-1271); direct donations have no sweep path; token governance/blocklisting can affect settlement; timestamp windows follow chain time; the allowlist is deployment configuration, not a mutable admin list. Payer-scoped IDs must be reconciled together with payer, contract, chain and full terms. Existing API/worker matching only by orderId and relayer quote/fee/restart issues remain later milestone work. This candidate is not cleared for product deployment by local tests.

This is AI review, not an independent human security audit. The earlier user exception explicitly replaced teammate review of the PoC. No independent final-contract teammate signoff is claimed here; the final security-review requirement must be resolved before Step 04 broadcasting. No external action is authorized by starting Step 03.

## Manual verification — run from repository root

```sh
pnpm install --frozen-lockfile --ignore-scripts
bash scripts/vendor-oz.sh
pnpm test:checkout
pnpm test:checkout:fork
pnpm --filter @whitepay/chain test
pnpm --filter @whitepay/chain typecheck
pnpm test
```

Expected counts: 39 checkout/smoke, 11 official-token local fork, 14 chain/Anvil, 28 root Node. The fork command requires public RPC access; all state changes remain local. The Anvil test command starts/stops a node bound to 127.0.0.1. None uses the user's keystores or deployed PoC.

For a focused human check of the security cases:

```sh
FOUNDRY_PROFILE=step03 forge test --root packages/contracts --match-test 'testDifferentPayerCannotBlockSignedOrder|testSamePayerCannotReuseOrderIdWithNewTerms|testExactSettlementEvent|testShort.*TransferRollsBack' -vv
```

Expect 5 passes. Inspect the nested replay mapping/read/write in WhitePayCheckout, the matching two-input getter in packages/chain/src/abi.ts and isSettled(payer,orderId), and full event equality in testExactSettlementEvent. Existing deployment fixture smoke tests are local, not proof of deployed/verified source.

Manual acceptance received: user independently reported 39 checkout tests, 11 official-token fork tests and 14 chain tests passed, then confirmed the remaining chain typecheck/root tests succeeded and requested the next step. Step 03 is accepted for the agreed commit/push workflow to origin/main; Step 04 preparation is now authorized. Final deployment/payment still require exact previews and specific approval, and the final independent-review requirement must be resolved before broadcasting.

## Historical teammate report

The previous Step 03 report recorded 20 mock tests and a production fork test deferred to Step 04. Those checks were real baseline coverage but did not detect cross-payer order-ID squatting, the stale reader ABI or the unused short-balance mock. Current results and boundaries above supersede its mock-green deployment assumptions.
