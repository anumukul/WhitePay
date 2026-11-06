# Step 04 — Final checkout deployment runbook

Prepared, not executed. Deployment, public explorer source submission, payer signing and payment broadcast require explicit approval of their specific previews. Step 03 acceptance alone does not authorize these actions. Current preview and source review: [step-04.md](../progress/step-04.md). Review follows the user's earlier request for assistant source review; no independent human audit/signoff is claimed.

## 1. Reproduce local checks

Run from repository root:

```bash
pnpm build:checkout
pnpm test:checkout
FOUNDRY_PROFILE=step03 forge test --root packages/contracts --match-contract DeploySmokeTest -vv
shasum -a 256 packages/contracts/src/WhitePayCheckout.sol
```

Expect 43 total tests, including 8 smoke/deployment-tool tests. Source SHA-256 must be `37c440f166e04dd646a1b4c551115b7d0fd7a7b043abae889f6a9bbc56cba3a5`, matching accepted commit `6f58f37`. Compiler: 0.8.24+commit.e11b9ed9, Paris, optimizer 200, viaIR enabled. Do not substitute the old experimental PoC artifact.

## 2. Review the exact unsigned preview

Local file: `docs/evidence/step-04-deployment-preview.json`. It contains public deployment data, not signatures or keys. Check:

- Chain 1874; sender `0x59F5C817cF19394402DcefeBaf5796Fe7514fDed`; latest and pending nonce 3.
- Constructor `(1874, [0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7])`; no other allowed token; native value zero.
- Full creation input hash `0x1bd599fc11cae8d9202aa5555c774e6329c38ec686191857ef965db9edf48c10`.
- Predicted address `0x4d1761ABB4eD290F23fcDA00890039800E2e53f0` has no code.
- Gas estimate 1,251,708; gas limit 2,000,000; max fee 20 gwei; priority fee cap 0.001 gwei.
- Estimated total cost 0.006259791708119273 WBT, including the snapshot L1 quote. Maximum L2 charge 0.04 WBT plus variable L1 fee.

Independently refresh RPC chain ID, block, latest/pending nonce, sender balance, empty predicted address, official proxy implementation/code hashes, constructor simulation and gas/L1 estimate immediately before signing. Changed source, constructor, nonce, fee limits or creation input requires a replacement preview and approval. Never reuse the old nonce-2 PoC command.

## 3. Approve and sign the reviewed creation transaction

After specific deployment approval, prepare a launcher bound to the reviewed unsigned payload and revalidate all fields. The user unlocks the existing encrypted deployer keystore in their private terminal; passwords must remain out of command arguments, chat and logs. No raw key, seed export or browser import is needed. Supply explicit nonce, gas and fee limits; reject mismatches instead of accepting wallet defaults. Do not run a generic broadcaster that can silently change these fields.

Compare the mined transaction with the approved preview. Require successful receipt and the predicted contract address, then compare complete deployed runtime with the constructor simulation, including immutable EIP712 values. Record actual gas price, gas used and any L1 fee, and reconcile the deployer balance debit.

## 4. Publish and verify source only after approval

The standard JSON bundle is already prepared locally in `docs/evidence/step-04-standard-input.json`. Recompiling it with the exact compiler matches the accepted base creation bytecode. Constructor arguments are separate. Read-only explorer API access was checked, but verification POST/authentication requirements have not been proven.

Use the official explorer endpoint `https://explorer.testnet.whitechain.io/api/`. Submit the exact standard JSON/compiler/constructor arguments after public-source approval. Confirm full verification through the explorer, exact source/settings and full deployed runtime; an accepted submission or Forge exit alone is insufficient. Do not claim verification if publication fails; record the failure and resolve it before milestone acceptance.

Read-only post-deployment checks (replace ADDRESS only after receipt verification):

```bash
cast chain-id --rpc-url https://rpc.testnet.whitechain.io
cast call ADDRESS 'expectedChainId()(uint256)' --rpc-url https://rpc.testnet.whitechain.io
cast call ADDRESS 'tokenAllowed(address)(bool)' 0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7 --rpc-url https://rpc.testnet.whitechain.io
cast call ADDRESS 'eip712Domain()(bytes1,string,string,uint256,address,bytes32,uint256[])' --rpc-url https://rpc.testnet.whitechain.io
```

Expect chain 1874, token allowed, domain name WhitePayCheckout/version 1/chain 1874/actual final address. Independently compare a canonical order digest with off-chain EIP712 encoding and verify payer-scoped `settled(address,bytes32)` ABI.

## 5. Prepare a separately approved live smoke payment

Payer snapshot: 4.995 official USDT and exactly zero WBT. Propose 1 USDT to merchant plus 0.001 USDT fee, leaving 3.994 USDT. Relayer has 0.099029250888990698 WBT. Refresh all balances; no additional funding is currently needed for this proposal.

After deployment, generate fresh order/quote identifiers, validity window and both signatures for the actual final contract domain. Obtain signing approval first. Keep signatures and executable payment payloads in ignored owner-only files. Simulate settlement, independently verify every signed field and decoded calldata, estimate actual gas/L1 cost and preview relayer nonce and fee limits. Request payment broadcast approval separately.

On confirmation require exact payer -1.001, merchant +1, fee recipient +0.001 USDT, zero receiver residual, and payer WBT exactly zero before/after. Reconcile relayer gas debit. Decode PaymentSettled including quoteId; check payer-scoped settlement and token authorization state. Attempt both order replay and token replay using read-only calls only. Record evidence, obtain manual acceptance, then commit/push Step 04. Do not advance to Step 05 before that acceptance.
