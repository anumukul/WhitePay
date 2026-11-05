# Official USDT compatibility — Step 01

Observed at 2026-11-05T16:46:16.972Z, chain **1874**, block **12300809** (`0xc525e6dccb09fd8c00ca78a2d2e9244ec4035f9675fe9a19a05bc55d879d3c89`).

This is a read-only compatibility investigation, not a successful payment or deployment.

## Live observations

| Item                          | Result                                                                       |
| ----------------------------- | ---------------------------------------------------------------------------- |
| Official token                | `0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7`                                 |
| Name / symbol / decimals      | Tether USD / USDT / **6**                                                    |
| Proxy                         | EIP-1967, runtime 2227 bytes                                                 |
| Implementation                | `0x26425662d126412128967ecf0a02ec48573026f7` (`TetherTokenV2`)               |
| Implementation verification   | Explorer fully verified; runtime byte-for-byte matches RPC                   |
| Compiler reported by explorer | v0.8.4+commit.c7e474f2                                                       |
| Token domain                  | name `Tether USD`, version `1`, chain 1874, verifying contract = token proxy |
| Domain separator              | `0xcdcfacb6b15c8238b4e5fbb47bdb83b7f83f50a531d264bf9763d2bd1d3d2a25`         |
| Result                        | **25/25 checks**, **15/15 call expectations** passed                         |

The proxy endpoint did not provide verified proxy source or an ABI. The implementation endpoint supplied verified implementation source and ABI. The probe reads the actual implementation slot, matches it to the explorer, and compares the implementation runtime. This does not establish proxy-admin ownership or upgrade safety.

## Exact behavior tested

- `permit(address,address,uint256,uint256,bytes)` and its `v,r,s` overload: valid EOA signature successfully simulates allowance of **one minor unit** without needing a token balance. Wrong chain, wrong nonce, and expired deadline are rejected for their intended reasons.
- `transferWithAuthorization` and `receiveWithAuthorization`, both bytes and `v,r,s` overloads: valid EOA signatures successfully simulate **zero-value** transfers. Mutating the signed amount is rejected as an invalid signature.
- `receiveWithAuthorization`: a third-party caller is rejected with `TetherToken: to != msg.sender`. A correctly signed **one-minor-unit** transfer reaches the insufficient-balance check, rather than failing signature validation.
- EIP-3009 typehashes and EIP-712 domain hash match independent local calculations.
- At exact `validAfter`, receive rejects as `auth early`; at exact `validBefore`, it rejects as `auth expired`. Verified source uses strict `timestamp > validAfter` and `< validBefore`.
- Post-simulation permit nonce remains zero, allowance remains zero, and authorization nonce remains unused. **This proves calls did not persist state; it does not prove mined replay protection.**

Probe addresses are freshly generated, disposable EOAs with zero WBT and zero USDT. Keys exist only in memory, are discarded, and never appear in the report. `eth_call` supplies the recipient as caller to test receiver semantics; no actual wallet transaction or contract receiver is involved.

The implementation source marks authorization used before transferring; failed execution rolls back. It uses a per-authorizer bytes32 nonce and a distinct permit counter. Source also permits token-owner blocklisting and includes privileged mint/burn behavior. Deployment and governance risks remain.

## Evidence and rerun

[Machine-readable snapshot](token-probe.json) contains ABI, source hashes, runtime hashes, block identity, function selectors, public probe addresses, expected rejection reasons, and sanitized RPC results.

```sh
pnpm install --frozen-lockfile
pnpm probe:token docs/evidence/token-probe-manual.json
```

Expected: `READ_ONLY_CAPABILITIES_VERIFIED`, 25 checks passed, exit 0. Uses public RPC/explorer; requires network access and no credentials. Each run uses fresh probe addresses and a fresh pinned block. The transport allowlist excludes transaction broadcast and account-unlock methods. Failure writes a `FAILED` report and exits nonzero.

## What remains unproven

No positive-value successful transfer, real payer/merchant/relayer, WBT gas debit, fee split, checkout event, mined receipt, source-verified WhitePay deployment, or persistent replay failure exists. These require separately approved Step 02 transactions. No RPC state overrides were used.

## Official references inspected

- [Whitechain testnet reference](https://docs.whitechain.io/learn/network/testnet.md): chain, RPC, gas token, and public limits.
- [Token proxy API](https://explorer.testnet.whitechain.io/api/v2/smart-contracts/0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7): proxy metadata.
- [Verified implementation](https://explorer.testnet.whitechain.io/address/0x26425662D126412128967ECf0a02EC48573026F7?tab=contract): TetherTokenV2, TetherToken, and EIP3009 sources.
- [Implementation API](https://explorer.testnet.whitechain.io/api/v2/smart-contracts/0x26425662D126412128967ECf0a02EC48573026F7): ABI and verified runtime.
- [Documentation index](https://docs.whitechain.io/llms.txt): no dedicated official test-USDT acquisition instructions identified in this index. Funding remains unresolved; the WBT faucet is not assumed to dispense USDT.
