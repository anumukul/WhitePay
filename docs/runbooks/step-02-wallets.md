# Step 02 wallet setup and live-proof plan

This runbook documents the wallet setup procedure; it does not authorize deployments or broadcasts. Run wallet creation in your own private terminal. No password, key, seed, or decrypted keystore should enter chat, logs, or Git.

## Create five encrypted wallets locally

From the WhitePay project root:

```sh
umask 077
unset CAST_PASSWORD CAST_UNSAFE_PASSWORD
mkdir -p keystores/whitepay-sepolia
chmod 700 keystores/whitepay-sepolia
cast wallet new keystores/whitepay-sepolia deployer
cast wallet new keystores/whitepay-sepolia relayer
cast wallet new keystores/whitepay-sepolia payer
cast wallet new keystores/whitepay-sepolia merchant
cast wallet new keystores/whitepay-sepolia feeRecipient
```

Each command uses a hidden password prompt and prints only the encrypted file path/public address. Use strong nonempty passwords held in your password manager, with a securely stored encrypted backup. If a named file already exists, stop and do not overwrite it. Use these wallets only for this testnet project.

Always include the keystore directory. **Bare `cast wallet new` prints a private key. Do not use it.** Do not use `decrypt-keystore`, export commands, raw-key arguments, inline passwords, verbose shell tracing, or terminal recording.

This encrypted-output behavior was checked against installed Foundry commit `f83bad912a9dba7bf0371def1e70bb1896048356`, `crates/cast/src/cmd/wallet/mod.rs`, encrypted `WalletSubcommands::New` branch. No real wallet was created or decrypted by the assistant.

Before funding, confirm that each password works and derive the real public address privately:

```sh
for role in deployer relayer payer merchant feeRecipient; do
  printf '%s: ' "$role"
  cast wallet address --keystore "keystores/whitepay-sepolia/$role"
done
```

Only public addresses are displayed. Compare them with the creation output.

## Export public-only config and capture initial balances

```sh
pnpm poc:wallet-addresses
pnpm poc:wallet-config
git check-ignore keystores/whitepay-sepolia/deployer
pnpm poc:preflight docs/evidence/poc-config.json docs/evidence/poc-before-funding.json
```

Some Foundry version-3 keystores omit address metadata entirely. Run `pnpm poc:wallet-addresses` in your own interactive terminal: it calls `cast wallet address --keystore` for each existing wallet with hidden password prompts, checks distinct addresses, and saves only public addresses plus chainId 1874 in `docs/evidence/wallet-public-addresses.json`. It creates no wallets and signs no messages/transactions.

The config helper reads public metadata from owner-only encrypted files without decrypting anything; when address metadata is absent it uses this public manifest. Embedded addresses, when present, must agree with the separately derived addresses. Both prefixed and unprefixed 20-byte hex addresses normalize to EIP-55. Missing/malformed/duplicate addresses are rejected. It writes `docs/evidence/poc-config.json` and refuses to overwrite an existing config. It rejects duplicate roles or secret fields. The keystores remain ignored by Git.

Preflight is read-only. Before funding, expect a balance table and BLOCKED/exit 1 for insufficient funds. This is an initial baseline, not a failed wallet setup. Confirm chain 1874, all five public addresses, payer WBT exactly 0, and token `0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7` with six decimals.

These are ordinary EVM EOAs, not intrinsically chain-bound wallets; every command/proof must check chain 1874. Do not use them on other networks.

## Funding targets and gates

| Role          | Proposed funding                             | Purpose                                               |
| ------------- | -------------------------------------------- | ----------------------------------------------------- |
| Deployer      | At least 0.10 test WBT                       | Deployment and fee reserve                            |
| Relayer       | At least 0.10 test WBT                       | Sponsored payment and fee reserve                     |
| Payer         | Request 10 official test USDT; minimum 5.005 | Pays 5 USDT plus 0.005 fee; WBT must remain exactly 0 |
| Merchant      | Nothing required                             | Receives USDT                                         |
| Fee recipient | Nothing required                             | Receives disclosed USDT fee                           |

Targets are operational buffers, not amounts that will be spent.

Official WBT faucet: https://faucet.testnet.whitechain.io/. User signs in with an eligible GitHub account, enters the **deployer** public address, and intentionally submits a claim only when ready to authorize that funding. Do not enter the payer address. The assistant will not submit it.

The official faucet guide currently describes 0.5 WBT per rolling 24 hours for GitHub accounts at least 30 days old, while the unauthenticated faucet page says one drip per GitHub account. Availability/limits must be confirmed in the authenticated UI; do not assume a second claim is permitted or bypass limits. For the relayer, request a direct DevRel funding transfer or propose a separate **0.10 WBT deployer → relayer** top-up. That top-up needs its own preview and explicit authorization before the assistant sends it. No transfer command is executed as part of wallet creation.

No verified public faucet for the exact official USDT was located. Use Whitechain's ETHGlobal sponsor/DevRel desk or official support links from the faucet footer. Suggested message for the user to send (assistant has not sent it):

> Please fund my dedicated payer address [PAYER PUBLIC ADDRESS] with 10 units of official test USDT at 0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7 on Whitechain Sepolia, chain ID 1874. Please do not send any native WBT to this address: our gasless proof requires the payer to remain at exactly zero WBT. Please provide the transfer/mint transaction hash and confirm the supported official funding method.

The sender pays the funding transaction's gas. An ERC-20 recipient needs no WBT to receive tokens. Do not bridge mainnet assets, buy real funds, substitute another token, or use the synthetic fork-mint method on live chain.

## Verify actual funded balances

```sh
pnpm poc:preflight docs/evidence/poc-config.json docs/evidence/poc-funded.json
```

Expect chain 1874, a five-role balance table, `payerChecks.zeroWbt: true`, and `payerChecks.sufficientOfficialUsdt: true`. Minimum payer USDT is 5,005,000 raw units. Any payer WBT above zero blocks the proof. Do not silently drain an accidentally funded payer and call it never-funded; use a fresh dedicated payer and record its baseline.

After setup, use the read-only preflight to confirm current public-wallet balances. The funding history is summarized in `docs/progress/step-02.md`; transaction-specific wallet JSON remains local and Git-ignored.

## Cost quote and limits

```sh
pnpm poc:estimate-deployment
```

This is a read-only estimate using an explicitly labeled unfunded example sender. Saved quote: `docs/evidence/poc-deployment-estimate-example.json`. At block 12305714, observed gas price was 5.001 gwei; estimated deployment gas was **1,283,551**, L2 fee **0.006419038551 WBT**, quoted L1 fee **0.000000000000096322 WBT**, total **0.006419038551096322 WBT**. This snapshot must be refreshed for the actual deployer and current nonce before approval.

Configured deployment ceiling: 2,000,000 gas at 20 gwei = **0.04 WBT L2 maximum**. Payment ceiling: 500,000 gas at 20 gwei = **0.01 WBT L2 maximum**. At the observed 5.001 gwei, the payment's 500,000-gas budget represents **0.0025005 WBT L2**. It is a budget, not measured payment gas. Actual payment estimation requires the deployed receiver and valid signatures.

L1 data fees are additional and variable; the L2 gas limit does not cap them. Quote via the official GasPriceOracle `getL1Fee(serializedUnsignedTransaction)` and obtain approval of the full expected spend plus a stated reserve. Do not treat these figures as a lifetime or all-in maximum.

## Exact deployment and payment sequence

1. Pass local tests and actual-wallet preflight. Second teammate reviews the experimental receiver. Keep manual approval and Git gates in place.
2. Preview creation of `WhitePayAuthorizationPoC`: chain 1874, source `packages/contracts/poc/WhitePayAuthorizationPoC.sol`, Solidity 0.8.24, Paris, optimizer 200, no constructor arguments, native value zero, exact deployer address/nonce, predicted CREATE address, current bytecode hash and fees. Current compiled init-code hash is `0xd15dad4d28075c99ab1088906ddd85de35bf57e34e2d198c7e81694c68cdfe18`; a source/build change requires a new preview. **STOP for deployment approval.**
3. After explicit approval only, deploy from the encrypted deployer keystore, record receipt/address, compare predicted and actual address/code, and verify network/token again. No payer transaction is needed.
4. Prepare a fresh orderId and quoteId. Use actual merchant/fee addresses, amount 5,000,000, fee 5,000, total 5,005,000 minor units, and a short validity window (proposed 15 minutes with validAfter already in the past). Both signatures must use the same terms and exact actual receiver.
5. Payer signs two typed messages in their own private keystore workflow: domain `WhitePayAuthorizationPoC`/version 1/chain 1874/actual receiver for the complete Order; then token domain `Tether USD`/version 1/chain 1874/official proxy for ReceiveWithAuthorization. Token nonce is the EIP-712 order digest. Do not publish usable signatures or include keys/passwords in chat.
6. Preview the exact `settle(Order,bytes,bytes)` calldata, relayer nonce, target, native value zero, signature recovery, simulations, gas and L1 fee. Save fresh balances and unused order/nonce. **STOP for separate payment-broadcast approval.**
7. After explicit approval only, relay one transaction. Require a successful receipt and one exact `PaymentSettled` event from the PoC, plus official token transfers payer → PoC 5.005, PoC → merchant 5, PoC → fee recipient 0.005. Verify no extra or partial payout and no residual PoC token balance.
8. Requery balances and ensure payer WBT remains exactly zero. Verify relayer is the actual transaction sender/gas payer, and record its WBT debit with L2 and L1 fee evidence.
9. Read-only replay of identical `settle` calldata must reject with `OrderAlreadySettled()`. Query `settled(orderId)=true` and `authorizationState(payer,nonce)=true`. Recipient-origin token replay simulation must reject `TetherToken: auth invalid`. No second transaction is broadcast to prove a revert.
10. Present actual receipt/logs/balances/explorer evidence for manual Step 02 review. No commit, push, or Step 03 until explicit user approval.

Expected successful balance changes:

| Role          | USDT change | WBT change                                              |
| ------------- | ----------- | ------------------------------------------------------- |
| Deployer      | 0           | Deployment fee only (separate from any approved top-up) |
| Relayer       | 0           | Payment L2 + L1 fees                                    |
| Payer         | −5.005      | **0 → 0**                                               |
| Merchant      | +5.000      | 0                                                       |
| Fee recipient | +0.005      | 0                                                       |
| PoC receiver  | Net 0       | 0                                                       |

With 10 initial payer USDT, expected remaining USDT is **4.995**. The fee treasury's USDT does not automatically convert into WBT or refill the relayer.

## Sources checked on 2026-11-05

- https://docs.whitechain.io/learn/get-started/get-testnet-wbt
- https://faucet.testnet.whitechain.io/
- https://docs.whitechain.io/learn/network/network-fees.md
- https://ethglobal.com/events/mumbai/prizes
- https://github.com/foundry-rs/foundry/blob/f83bad912a9dba7bf0371def1e70bb1896048356/crates/cast/src/cmd/wallet/mod.rs

## Updated funding path — YetiTrade

User reports Whitechain DevRel confirmed that the exact official USDT is available by swapping test WBT on YetiTrade. Independent read-only router/token/factory/quote checks supported this path, and the user's isolated-wallet swap has since been verified. See [the isolated-wallet YetiTrade plan](step-02-yetitrade-funding.md) for the procedure; the current payer transfer status is in `docs/progress/step-02.md`.
