# Step 02 — Acquire exact official USDT through YetiTrade

Status: The user's isolated trading-wallet swap for official USDT was verified. Its exact receipts, minimum-output difference, resulting balances, and remaining approvals are recorded in the Step 02 report and local Git-ignored evidence. The separate 10-USDT payer transfer remains a distinct approval-gated action. No WhitePay deployment or checkout payment has occurred. The plan and independent source/route/simulation checks below document the procedure and its limits.

This is operational testnet funding only. WhitePay's MVP does not gain a swap/bridge feature. The payer remains entirely separate from trading and must retain exactly zero native WBT.

## Verified identities

| Item                                      | Value                                                      |
| ----------------------------------------- | ---------------------------------------------------------- |
| App                                       | https://testnet.yetitrade.fi/swap                          |
| Chain                                     | Whitechain Sepolia, 1874                                   |
| Output token                              | `0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7`, six decimals |
| App Universal Router                      | `0xbCB198083504E31293bC3765b3c791cF2B2202d8`               |
| Factory                                   | `0x94aFa2aB80E44163362D2952bdf1E95b81900738`               |
| QuoterV2                                  | `0x90f28c3a6233713d6Df00E5fa92a3f13EFe36191`               |
| Wrapped native WBT                        | `0x4200000000000000000000000000000000000006`               |
| Permit2 (unused by reviewed native route) | `0x000000000022D473030F116dDEE9F6B43aC78BA3`               |
| Existing payer                            | `0x9AfB652bB337eB4D5a09221Af7972D69B500e035`               |

Router/factory/quoter addresses agree between YetiTrade's own contract reference and app bundle. App `/api/tokens` lists the exact USDT under chain 1874 with six decimals. Onchain metadata confirms six decimals. Explorer marks router source verified, **not fully verified**; RPC runtime matches the explorer's reported deployed runtime. These checks are not an audit.

## Sample quote — not an executable approval

Captured block **12309462**, using an explicitly synthetic public fixture sender, not a real trading wallet:

- Input: **0.15 native WBT**.
- Quoted output: **11.028196 official USDT**.
- Encoded minimum received: **10.973329 official USDT**.
- Slippage setting: **50 bps / 0.5%**.
- API-reported price impact: **0.31%**.
- Route: wrapped WBT → USDC.e → exact official USDT. USDC.e is an internal pool hop; the final output is the required USDT.
- Pools: `0x18Dd0B12C80dE2c83b830f431F237b7dBfCDB75E` (0.30%), then `0x55be766653043567f2434382e18191cBaa98B900` (0.01%). Both independently matched the published factory's `getPool` response.
- Independent QuoterV2 `eth_call` at the quote block returned the same 11.028196 USDT.
- Transaction value: exactly 0.15 WBT. Target: the published Universal Router.
- Decoded commands: `0x0b00`, WRAP_ETH then V3 exact-input. Wrapped input is paid from router-held funds (`payerIsUser=false`); output recipient is the specified taker.
- No partner fee or allow-failure command accepted. All calldata/path/amount/recipient/deadline checks must pass before signing.

Minimum was decoded from the actual calldata, rather than inferred from a display. Its rounding is within the stated 0.5% tolerance and is above 10 USDT. Requote if the encoded minimum drops below **10,000,000 minor units**. Never use an expired quote or this fixture's calldata for a real wallet.

## Allowance and gas findings

The reviewed native route needs **zero ERC-20 approvals**: it spends `msg.value`, wraps inside the router, and does not pull wrapped input from the user. The API advertises Permit2 as a generic allowance target but reports no allowance issue for this native route; no Permit2 signature or USDT approval is needed. The later direct USDT transfer also needs no allowance.

If the UI instead requests a separate wrap, WWBT approval, Permit2 signature/approval, or an unlimited allowance, stop and inspect that different path. Do not sign extra steps under approval of this native transaction.

API gas estimate: 300,000 units. Independent `eth_estimateGas` with a **synthetic 0.20 WBT balance override**: **256,688 gas**, about **0.00128369668800682 WBT** including the snapshot L1 quote. This changed no real balance or onchain state and does not prove actual-wallet readiness. The API itself reported `simulationIncomplete=true` for the unfunded fixture; the independent simulation is separately labeled.

Proposed review limits for the eventual swap: gas ceiling **350,000**, max fee **20 gwei**, priority cap **0.001 gwei** (L2 ceiling **0.007 WBT**, plus variable L1 data fees). Refresh exact gas and L1 fees for the actual wallet/calldata, and stop if the gas estimate exceeds the proposed ceiling. These limits are proposed, not approved.

The sample direct transfer of 10 USDT estimated **61,736 gas** using an existing public token holder in read-only simulation, roughly **0.000308741736 WBT L2** at the snapshot price. Proposed later transfer ceiling: 80,000 gas and 20 gwei max fee, or **0.0016 WBT L2** plus variable L1 data fees. It must be re-estimated from the actual trading wallet after the swap. No fee is charged to the payer.

## Phase 1 — Isolated trading wallet and funding preview

1. After reviewing this plan, create a fresh testnet-only browser wallet yourself in a separate browser profile. Use a new wallet, not an import of deployer/relayer keystores or seeds. Keep recovery material and passwords private; never send them to the assistant or capture them in screenshots/logs.
2. Share only its public address. It must be distinct from all five WhitePay roles. Verify it is a normal EOA and capture its initial native/token balances on chain 1874. The assistant will not create a wallet without a specific instruction.
3. Configure Whitechain Sepolia: chain 1874, RPC `https://rpc.testnet.whitechain.io`, native WBT, explorer `https://explorer.testnet.whitechain.io`.
4. Propose **0.20 test WBT** funding to that trading address. This covers the example 0.15 input and leaves 0.05 for swap/USDT-transfer fees. Prefer a separately approved deployer-keystore transfer; no deployer key is imported into the browser. A direct authorized faucet claim is an alternative if eligible.
5. Once the trading address exists, prepare the exact funding transaction with fresh sender nonce, destination, balances and L2/L1 gas quote. The earlier deployer→relayer approval does not cover this transfer. **STOP for explicit funding approval.**
6. After approved funding is mined, independently verify the 0.20 WBT credit. Do not send WBT to the payer.

## Phase 2 — Native WBT swap preview

1. Open only https://testnet.yetitrade.fi/swap and connect the temporary trading wallet. Check `eth_chainId=0x752` / 1874. Do not connect the deployer, relayer or payer.
2. Select **native WBT** input, not WWBT. Search/select output by exact address `0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7`, then confirm six decimals.
3. Enter **0.15 WBT**, never MAX. Use manual **0.5% slippage**, a short deadline (proposed 10 minutes), and confirm the output recipient is the trading wallet.
4. Obtain a fresh unsigned quote for the real trading address. Check exact route/pools through the canonical factory, router, input value, output token, recipient, command bytes, encoded minimum ≥10 USDT, deadline, and no partner fee. Repeat an independent QuoterV2 call and actual-wallet simulation/gas estimate. Review both the native balance and any allowance issue; the verified native path needs none.
5. Present the exact nonce, unsigned calldata, max fees, L1 quote and expected balance changes. **STOP for separate swap approval before confirming in the wallet.** If any UI transaction differs, do not sign it; inspect it as a new preview.
6. After approval and execution only, verify the successful receipt, exact output-token transfers, actual received amount ≥ the encoded minimum, WBT spent and gas fees. Confirm the trading wallet retains enough WBT for its final ERC-20 transfer.

## Phase 3 — Prepare 10 USDT to payer after the swap

Prepare a new transaction with:

- From: actual temporary trading wallet (currently unknown).
- Chain: 1874.
- To/transaction target: **USDT contract** `0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7`.
- Function: `transfer(0x9AfB652bB337eB4D5a09221Af7972D69B500e035, 10000000)`.
- Native value: **0 WBT**.
- Approval/allowance: none; sender transfers its own tokens.
- Nonce, gas and L1 fee: query after the actual swap; do not guess.

The public calldata template is saved in `docs/evidence/yetitrade-funding-preview.json`. Do not broadcast it until a post-swap preview and explicit transfer approval. The trading wallet pays gas; the payer only receives the ERC-20 transfer.

Verify before transfer: trading balance ≥10 USDT plus native gas reserve; payer native WBT exactly zero; correct chain/token/recipient. **STOP for explicit 10-USDT transfer approval.** After execution, verify successful receipt and one exact 10,000,000-unit official-token credit to the payer, the corresponding trading-wallet debit, and payer WBT **0 → 0**. With the sample swap output, trading USDT would remain 1.028196; actual remainder depends on mined output. Payer would then have 10 USDT and no WBT.

Run the existing read-only payer preflight after settlement. This is acquisition of the existing official token, not permissionless minting, replacement tokens, or a WhitePay contract deployment. No commit, push, or Step 03 without explicit approval.

## Evidence and checks

- `docs/evidence/yetitrade-funding-preview.json`: raw unsigned fixture quote, actual calldata minimum, independent factory/quoter/router verification, synthetic swap gas estimate, transfer template, and current zero-WBT payer observation.
- `scripts/poc/yeti-quote.mjs`: read-only validator; it has no wallet client, signer, or broadcaster.
- `tests/yeti-funding.test.mjs`: RED for absent helper, then passing tests for output identity, minimum/recipient/payer tampering, wrong chain/router/value, excessive slippage, expiry and allow-failure rejection. Uses a public fixture quote, never a real wallet key.

Sources: [YetiTrade contracts](https://docs.yetitrade.fi/reference/contracts.md), [token list](https://testnet.yetitrade.fi/api/tokens), [swap guide](https://docs.yetitrade.fi/guides/swap.md), [quote API](https://docs.yetitrade.fi/api-reference/quotes/get-a-swap-quote.md).
