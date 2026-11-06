import { WhitePayChainClient } from '@whitepay/chain';
import { migrate, closeDb } from './db.js';
import { startDaemon } from './daemon.js';
import { createRelayerAdapter } from './chain.js';
import type { RelayerConfig } from './types.js';
import { isAddress, type Hex } from 'viem';
function address(name: string): Hex {
  const value = process.env[name];
  if (!value || !isAddress(value))
    throw new Error(`${name} public address required`);
  return value as Hex;
}
// Deliberately no RELAYER_PRIVATE_KEY support and no automatic signing/broadcast.
if (
  process.env.RELAYER_EXECUTION_MODE &&
  process.env.RELAYER_EXECUTION_MODE !== 'preview'
)
  throw new Error(
    'Use preview; live execution needs a separately reviewed exact approval and secure signer',
  );
await migrate();
const cfg: RelayerConfig = {
  expectedChainId: 1874,
  checkoutAddress: address('WHITEPAY_CHECKOUT_CONTRACT_ADDRESS'),
  tokenAddress: '0xcedfb56113143d55b2358b8cfbb0deb5ad2f55a7',
  feeRecipient: address('WHITEPAY_FEE_RECIPIENT'),
  feeBasisPoints: Number(process.env.WHITEPAY_FEE_BASIS_POINTS ?? 10),
  maxGasPerSettle: 500000n,
  maxGasPriceWei: 20000000000n,
  priorityFeeWei: 1000000n,
  maxL1FeeWei: 1000000000000n,
  dailyBudgetWei: 100000000000000000n,
  minimumValiditySeconds: 120,
  mode: 'preview',
};
const client = new WhitePayChainClient({
  rpcUrl: process.env.WHITECHAIN_RPC_URL ?? 'https://rpc.testnet.whitechain.io',
  expectedChainId: 1874,
  checkoutAddress: cfg.checkoutAddress,
});
const handle = startDaemon(
  cfg,
  createRelayerAdapter(
    client,
    address('RELAYER_PUBLIC_ADDRESS'),
    '0x3a9aa44166dd8ec13f12718f9b5c4515ea494622654761b1cb26f23c6c456efd',
  ),
);
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.once(signal, () => {
    void handle.stop().then(() => closeDb());
  });
