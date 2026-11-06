# Step 04 — Deploy + verify (PREPARED, not executed)

Status: **blocked on human approval ("approve deploy"), second-teammate security review, and Step 02 payer funding for post-deploy settlement.**

Nothing has been broadcast. No keystores decrypted. No RPC calls made.

## Deliverables

- `packages/contracts/script/DeployWhitePayCheckout.s.sol` — Foundry script. Reads `EXPECTED_CHAIN_ID` and `WHITECHAIN_USDT_ADDRESS` from env, deploys with a single-token allowlist. Dry-run tested.
- `packages/contracts/test/unit/DeploySmoke.t.sol` — 4 acceptance tests (empty address fails, fresh deploy passes all checks, wrong-chain constructor reverts, zero-token-in-allowlist reverts). **All green.**
- `docs/runbooks/step-04-deploy.md` — exact operator commands for compile, dry-run, simulated-remote, broadcast+verify, post-deploy smoke, and the separate settlement external write.

## Test evidence

```
$ FOUNDRY_PROFILE=step03 forge test --match-path 'test/unit/DeploySmoke.t.sol'
Ran 4 tests for test/unit/DeploySmoke.t.sol:DeploySmokeTest
[PASS] testEmptyAddressFailsSmoke()                       (gas:    2,795)
[PASS] testFreshDeploymentPassesSmoke()                   (gas: 1,270,450)
[PASS] testWrongChainConstructorRejected()                (gas:  218,191)
[PASS] testZeroTokenInAllowlistRejected()                 (gas:  218,425)
Suite result: ok. 4 passed; 0 failed; 0 skipped
```

## Dry-run evidence

```
$ EXPECTED_CHAIN_ID=1874 WHITECHAIN_USDT_ADDRESS=0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7 \
  FOUNDRY_PROFILE=step03 forge script script/DeployWhitePayCheckout.s.sol --sig 'run()' --chain-id 1874
Script ran successfully.
Gas used: 1278582

== Return ==
checkout: contract WhitePayCheckout 0x7FA9385bE102ac3EAc297483Dd6233D62b3e1496
tokens: address[] [0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7]
```

Address shown is a deterministic in-memory address from the forge dry-run EVM, not an on-chain deployment.

## What a human must still do

1. **Security review of `src/WhitePayCheckout.sol`** by a second teammate (PR.md 10.4 mandates this before Step 04). Record signoff in `docs/progress/step-04-signoff.md`.
2. Confirm RPC: `cast chain-id --rpc-url $WHITECHAIN_RPC_URL` returns `1874`.
3. Confirm deployer WBT balance (needs ≈0.01 WBT headroom; Step 02 preview quoted 0.00642 WBT for this exact contract).
4. Run Section 3 of the runbook (simulated remote, still no broadcast). Verify constructor calldata is the exact USDT address.
5. **Approve.** Then run Section 4 (broadcast + verify). Record address/tx/block/domain-separator into `docs/evidence/step-04-deploy.json`.
6. Run Section 5 (acceptance smoke against live address). All checks must pass or roll back the advertisement.
7. **Separate approval** for the real-USDT settlement (Section 6), which is still blocked on Step 02 funding.

## What I cannot do without approval

- Broadcast the deployment transaction.
- Verify on Blockscout (no network write without broadcast first, and verification posts source to Blockscout's public API).
- Execute the post-deploy smoke against a live RPC (read-only but requires an RPC URL I don't have; operator should run it).
- Settle a real payment (needs funded payer).

## Pending for Step 02 completion

The runbook documents the settlement step but it can't be run until the Step 02 funding blockers clear. Once a payer holds ≥5.005 USDT and zero WBT, a one-off settlement script (or the Step 05 API once it ships) produces the signed order; broadcasting the settle call is the second external write.
