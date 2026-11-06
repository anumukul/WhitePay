import React from 'react';
import { createRoot } from 'react-dom/client';
import {
  WhitePayCheckout,
  createCheckoutClient,
  type WalletProvider,
} from '../src/index.js';
const config = (globalThis as any).__whitepay;
const provider: WalletProvider = {
  request: async (args) => {
    const response = await fetch('/wallet', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin',
      redirect: 'error',
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(120000),
    });
    if (!response.ok) throw new Error('wallet_signing_failed');
    return (await response.json()).result;
  },
};
createRoot(document.getElementById('root')!).render(
  <main>
    <h1>
      {config.readOnly
        ? 'WhitePay payment receipt'
        : 'WhitePay testnet checkout'}
    </h1>
    <p>Payer signing only. No transaction will be broadcast by this page.</p>
    <p>
      Wallet approval opens a hidden password prompt in your private terminal.
      Never enter passwords or recovery phrases in this page.
    </p>
    <WhitePayCheckout
      sessionId={config.sessionId}
      backend={createCheckoutClient()}
      provider={provider}
    />
  </main>,
);
