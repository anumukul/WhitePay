import { WhitePayChainClient } from '@whitepay/chain';
import { migrate, closeDb } from './db.js';
import { createWorkerReader } from './chain.js';
import { startDaemon, startDeliveryDaemon } from './daemon.js';
const checkout = '0x4d1761ABB4eD290F23fcDA00890039800E2e53f0';
await migrate();
const client = new WhitePayChainClient({
  rpcUrl: process.env.WHITECHAIN_RPC_URL ?? 'https://rpc.testnet.whitechain.io',
  expectedChainId: 1874,
  checkoutAddress: checkout,
});
const handle = startDaemon(
  {
    scope: 'whitepay-1874-' + checkout.toLowerCase(),
    chainId: 1874,
    checkoutAddress: checkout,
    fromBlock: 12369576,
    confirmations: 2,
  },
  createWorkerReader(
    client,
    '0x3a9aa44166dd8ec13f12718f9b5c4515ea494622654761b1cb26f23c6c456efd',
  ),
);
const delivery =
  process.env.WHITEPAY_WEBHOOK_DELIVERY_ENABLED === '1'
    ? startDeliveryDaemon({
        allowedOrigins: (process.env.WHITEPAY_WEBHOOK_ALLOWED_ORIGINS ?? '')
          .split(',')
          .filter(Boolean),
      })
    : undefined;
console.log(
  delivery
    ? '[worker] indexing and explicitly configured webhook delivery enabled'
    : '[worker] indexing enabled; webhook delivery disabled',
);
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.once(signal, () => {
    void Promise.all([handle.stop(), delivery?.stop()]).then(() => closeDb());
  });
