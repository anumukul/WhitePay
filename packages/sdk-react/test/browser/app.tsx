import React from 'react';
import { createRoot } from 'react-dom/client';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { WhitePayCheckout, createCheckoutClient } from '../../src/index.js';
const config = (globalThis as any).__testConfig;
const mode = new URLSearchParams(location.search).get('mode');
// Ephemeral, unfunded test account only. Never uses a browser extension or real wallet.
const account = privateKeyToAccount(generatePrivateKey());
let chain = mode === 'wrong-chain' ? '0x1' : '0x752';
const state = {
  methods: [] as string[],
  signedCount: 0,
  completed: 0,
  error: null as string | null,
};
(globalThis as any).__testState = state;
const provider = {
  request: async ({ method, params }: any) => {
    state.methods.push(method);
    if (method === 'eth_chainId') return chain;
    if (method === 'wallet_switchEthereumChain') {
      chain = '0x752';
      return null;
    }
    if (method === 'eth_requestAccounts' || method === 'eth_accounts')
      return [account.address];
    if (method === 'eth_getBalance') return '0x0';
    if (method === 'eth_call')
      return '0x' + 2000000n.toString(16).padStart(64, '0');
    if (method === 'eth_signTypedData_v4') {
      if (mode === 'reject') throw { code: 4001 };
      state.signedCount++;
      return account.signTypedData(JSON.parse(params[1]));
    }
    throw new Error('unexpected_test_wallet_request');
  },
};
const backend = createCheckoutClient();
if (mode === 'tamper') {
  const quote = backend.quote;
  backend.quote = async (...args) => {
    const q = await quote(...args);
    q.typedData.message.amount = '2000000';
    return q;
  };
}
createRoot(document.getElementById('root')!).render(
  <>
    <p>Automated test wallet · simulated chain · no transactions</p>
    <WhitePayCheckout
      sessionId={config.sessionId}
      backend={backend}
      provider={mode === 'no-wallet' ? undefined : provider}
      onComplete={() => {
        state.completed++;
      }}
      onError={(e) => {
        state.error = e.message;
      }}
    />
  </>,
);
