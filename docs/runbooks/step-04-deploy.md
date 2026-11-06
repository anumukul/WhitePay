# Step 04 — Deploy runbook (prepared, not executed)

External-write gate. Nothing in this runbook has been broadcast. All commands below are intended to be run by a human operator after explicit approval in follow-up.

## Pre-flight (one-time, human-confirmed)

- Branch at `f91920e` or later (Step 03 GREEN).
- Deployer keystore encrypted at the path recorded in `docs/progress/step-02.md`. **Do not paste the password into chat.** Refresh gas and L1 fees for the approved final candidate, constructor args and current nonce. Step 02's deployment estimate applied to the experimental PoC; it is not a quote for this changed final contract.
- `WHITECHAIN_RPC_URL` set to an RPC you trust; confirm `cast chain-id --rpc-url $WHITECHAIN_RPC_URL` returns `1874`.
- Second-teammate security review of `src/WhitePayCheckout.sol` signed off (PR.md Section 10.4 requires this before Step 04).

## 1. Compile (reproducible, no secrets touched)

```bash
cd packages/contracts
bash ../../scripts/vendor-oz.sh
FOUNDRY_PROFILE=step03 forge build
```

Record the exact compiler output hash:

```bash
cat out-step03/WhitePayCheckout.sol/WhitePayCheckout.json | jq -r '.metadata.sources."src/WhitePayCheckout.sol".keccak256'
```

Pin this hash in the step report before broadcasting.

## 2. Dry-run (safe, no RPC)

```bash
export FOUNDRY_PROFILE=step03
export EXPECTED_CHAIN_ID=1874
export WHITECHAIN_USDT_ADDRESS=0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7
forge script script/DeployWhitePayCheckout.s.sol --sig 'run()' --chain-id 1874
```

Expected on 2026-11: `Gas used: 1278582`. Returns a fake deployment address from the in-memory EVM. **No network call.** Confirmed GREEN.

## 3. Simulated remote (uses RPC, still does NOT broadcast)

```bash
forge script script/DeployWhitePayCheckout.s.sol --sig 'run()' \
  --rpc-url $WHITECHAIN_RPC_URL \
  --sender $DEPLOYER_ADDRESS
```

Expected: successful simulation, printed gas estimate, printed future contract address derived from (sender, nonce). No tx submitted. Review the printed **constructor calldata** — it must contain the exact USDT address bytes with no accidental substitution.

## 4. Broadcast + verify (THIS IS THE EXTERNAL WRITE — requires approval)

**Do not run without the "approve deploy" message.** Draft command:

```bash
forge script script/DeployWhitePayCheckout.s.sol --sig 'run()' \
  --rpc-url $WHITECHAIN_RPC_URL \
  --keystore $DEPLOYER_KEYSTORE \
  --sender $DEPLOYER_ADDRESS \
  --broadcast \
  --verify --verifier blockscout \
  --verifier-url https://sepolia.whitechain.io/api/ \
  --slow
```

If Foundry's bundled verification fails, verify manually:

```bash
forge verify-contract <DEPLOYED_ADDRESS> src/WhitePayCheckout.sol:WhitePayCheckout \
  --verifier blockscout \
  --verifier-url https://sepolia.whitechain.io/api/ \
  --chain-id 1874 \
  --compiler-version 0.8.24 \
  --optimizer-runs 200 \
  --constructor-args $(cast abi-encode 'constructor(uint256,address[])' 1874 '[0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7]')
```

## 5. Post-deploy acceptance smoke

Run the acceptance script against the live address. Any failure means do **not** advertise this deployment.

```bash
# 5a: direct checks via cast
cast call $DEPLOYED_ADDRESS "expectedChainId()(uint256)" --rpc-url $WHITECHAIN_RPC_URL   # expect 1874
cast call $DEPLOYED_ADDRESS "tokenAllowed(address)(bool)" 0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7 --rpc-url $WHITECHAIN_RPC_URL   # expect true
cast code $DEPLOYED_ADDRESS --rpc-url $WHITECHAIN_RPC_URL | head -c 64   # must not be 0x

# 5b: EIP-712 domain separator vs recomputed
cast call $DEPLOYED_ADDRESS "eip712Domain()(bytes1,string,string,uint256,address,bytes32,uint256[])" --rpc-url $WHITECHAIN_RPC_URL
# Check fields/name/version/chain/verifyingContract; inherited EIP712 exposes eip712Domain(), not DOMAIN_SEPARATOR().
# Independently compare orderDigest for a canonical order against off-chain EIP-712 encoding.
```

Record:

- `DEPLOYED_ADDRESS`
- Deploy tx hash
- Block number
- Blockscout verified-source URL
- EIP-712 domain fields and independently matched order digest

in `docs/evidence/step-04-deploy.json` (gitignored path for pre-publication, then promoted).

## 6. Real official-USDT settlement (SEPARATE external-write gate)

**This is a second external write and a second approval.** Requires:

- Payer funded with ≥ 5.005 official USDT, **zero WBT**. Still blocked on the 10-USDT transfer from Step 02 funding plan.
- Relayer wallet funded with WBT for a fresh final-contract gas estimate and L1 fee quote. The accepted PoC's actual gas cost is evidence, not an unchanged fee quote for this contract.
- A signed order from the payer (produced by the Step 05 API once Step 05 lands — or manually via a one-off script for the Step 04 proof).

Approval phrases expected: "approve deploy" (for step 4 broadcast) and separately "approve settlement" (for step 6).

## What is NOT prepared

- No private keys handled. No keystores decrypted.
- No RPC URL hardcoded. Operator supplies.
- No Blockscout API key required (Whitechain explorer accepts verification without a key as of 2026-11; re-check before running).
- No settlement script yet — builds on Step 05's quote/signing surface.
