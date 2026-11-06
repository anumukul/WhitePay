import {
  hashTypedData,
  recoverTypedDataAddress,
  isAddress,
  formatUnits,
} from 'viem';
export interface WalletProvider {
  request(args: { method: string; params?: unknown[] }): Promise<any>;
}
export interface CheckoutSessionView {
  id: string;
  status: 'open' | 'settled' | 'canceled';
  amountMinor: number;
  currency: 'USDT';
  tokenAddress: string;
  payoutAddress: string;
  chainId: number;
  checkoutAddress: string;
  feeRecipient: string;
  feeBasisPoints: number;
  minimumValiditySeconds: number;
}
export interface CheckoutQuote {
  submissionId: string;
  orderDigest: string;
  typedData: any;
  tokenTypedData: any;
}
export interface PaymentStatus {
  sessionStatus: string;
  payment: null | {
    id: string;
    sessionId: string;
    status: string;
    amountMinor: number;
    txHash: string;
    blockNumber: number;
  };
}
export interface CheckoutBackend {
  session(id: string): Promise<CheckoutSessionView>;
  quote(
    id: string,
    payerAddress: string,
    renew?: boolean,
  ): Promise<CheckoutQuote>;
  submit(
    id: string,
    submissionId: string,
    signatures: { orderSignature: string; tokenSignature: string },
  ): Promise<void>;
  status(id: string): Promise<PaymentStatus>;
}
const TOKEN = '0xcedfb56113143d55b2358b8cfbb0deb5ad2f55a7';
const CHECKOUT = '0x4d1761abb4ed290f23fcda00890039800e2e53f0';
const same = (a: unknown, b: unknown) =>
  String(a).toLowerCase() === String(b).toLowerCase();
const domainFields = [
  { name: 'name', type: 'string' },
  { name: 'version', type: 'string' },
  { name: 'chainId', type: 'uint256' },
  { name: 'verifyingContract', type: 'address' },
];
const orderFields = [
  { name: 'orderId', type: 'bytes32' },
  { name: 'payer', type: 'address' },
  { name: 'merchant', type: 'address' },
  { name: 'amount', type: 'uint256' },
  { name: 'fee', type: 'uint256' },
  { name: 'feeRecipient', type: 'address' },
  { name: 'token', type: 'address' },
  { name: 'validAfter', type: 'uint256' },
  { name: 'validBefore', type: 'uint256' },
  { name: 'quoteId', type: 'bytes32' },
];
const tokenFields = [
  { name: 'from', type: 'address' },
  { name: 'to', type: 'address' },
  { name: 'value', type: 'uint256' },
  { name: 'validAfter', type: 'uint256' },
  { name: 'validBefore', type: 'uint256' },
  { name: 'nonce', type: 'bytes32' },
];
function assert(
  condition: unknown,
  code = 'quote_mismatch',
): asserts condition {
  if (!condition) throw new Error(code);
}
function schema(td: any, primary: string, fields: typeof domainFields) {
  assert(td?.primaryType === primary && td.types && td.domain && td.message);
  assert(
    JSON.stringify(Object.keys(td.types).sort()) ===
      JSON.stringify(['EIP712Domain', primary].sort()),
  );
  for (const [name, expected] of [
    ['EIP712Domain', domainFields],
    [primary, fields],
  ] as const)
    assert(
      Array.isArray(td.types[name]) &&
        JSON.stringify(td.types[name].map((f: any) => [f.name, f.type])) ===
          JSON.stringify(expected.map((f) => [f.name, f.type])),
    );
  assert(
    JSON.stringify(Object.keys(td.domain).sort()) ===
      JSON.stringify(
        ['name', 'version', 'chainId', 'verifyingContract'].sort(),
      ),
  );
  assert(
    JSON.stringify(Object.keys(td.message).sort()) ===
      JSON.stringify(fields.map((f) => f.name).sort()),
  );
}
export function validateCheckoutQuote(
  q: CheckoutQuote,
  s: CheckoutSessionView,
  payer: string,
  now = Math.floor(Date.now() / 1000),
) {
  assert(
    s.status === 'open' &&
      s.chainId === 1874 &&
      same(s.tokenAddress, TOKEN) &&
      same(s.checkoutAddress, CHECKOUT),
  );
  assert(
    Number.isSafeInteger(s.amountMinor) &&
      s.amountMinor > 0 &&
      s.currency === 'USDT',
  );
  assert(
    Number.isSafeInteger(s.feeBasisPoints) &&
      s.feeBasisPoints >= 0 &&
      s.feeBasisPoints <= 10000,
  );
  assert(s.minimumValiditySeconds === 120);
  for (const a of [payer, s.payoutAddress, s.feeRecipient, s.checkoutAddress])
    assert(isAddress(a) && !same(a, '0x' + '0'.repeat(40)));
  assert(
    new Set(
      [payer, s.payoutAddress, s.feeRecipient, s.checkoutAddress].map((a) =>
        a.toLowerCase(),
      ),
    ).size === 4,
  );
  const td = q.typedData,
    token = q.tokenTypedData;
  schema(td, 'Order', orderFields);
  schema(token, 'ReceiveWithAuthorization', tokenFields);
  assert(
    td.domain.name === 'WhitePayCheckout' &&
      td.domain.version === '1' &&
      td.domain.chainId === 1874 &&
      same(td.domain.verifyingContract, CHECKOUT),
  );
  assert(
    token.domain.name === 'Tether USD' &&
      token.domain.version === '1' &&
      token.domain.chainId === 1874 &&
      same(token.domain.verifyingContract, TOKEN),
  );
  const m = td.message,
    t = token.message;
  assert(
    typeof m.amount === 'string' &&
      /^\d+$/.test(m.amount) &&
      typeof m.fee === 'string' &&
      /^\d+$/.test(m.fee),
  );
  const amount = BigInt(m.amount),
    fee = BigInt(m.fee);
  assert(
    amount === BigInt(s.amountMinor) &&
      fee === (amount * BigInt(s.feeBasisPoints)) / 10000n,
  );
  assert(
    same(m.payer, payer) &&
      same(m.merchant, s.payoutAddress) &&
      same(m.feeRecipient, s.feeRecipient) &&
      same(m.token, TOKEN),
  );
  for (const key of ['orderId', 'quoteId'])
    assert(
      /^0x[0-9a-fA-F]{64}$/.test(m[key]) &&
        !same(m[key], '0x' + '0'.repeat(64)),
    );
  assert(
    Number.isSafeInteger(m.validAfter) &&
      Number.isSafeInteger(m.validBefore) &&
      m.validAfter < now &&
      m.validBefore > m.validAfter,
  );
  assert(m.validBefore > now + s.minimumValiditySeconds, 'quote_expired');
  assert(m.validBefore - m.validAfter === 960, 'quote_window_mismatch');
  const digest = hashTypedData(td);
  assert(
    same(digest, q.orderDigest) && /^sub_[a-zA-Z0-9_-]+$/.test(q.submissionId),
  );
  assert(
    same(t.from, payer) &&
      same(t.to, CHECKOUT) &&
      t.value === (amount + fee).toString() &&
      t.validAfter === m.validAfter &&
      t.validBefore === m.validBefore &&
      same(t.nonce, digest),
  );
  return {
    amount: formatUnits(amount, 6),
    fee: formatUnits(fee, 6),
    total: formatUnits(amount + fee, 6),
    validBefore: m.validBefore as number,
  };
}
export interface PreparedCheckout {
  session: CheckoutSessionView;
  quote: CheckoutQuote;
  payer: string;
  display: ReturnType<typeof validateCheckoutQuote>;
}
async function walletIdentity(
  provider: WalletProvider,
  payer?: string,
  connect = false,
) {
  assert(
    Number(await provider.request({ method: 'eth_chainId' })) === 1874,
    'wrong_chain',
  );
  const accounts = await provider.request({
    method: connect ? 'eth_requestAccounts' : 'eth_accounts',
  });
  assert(
    Array.isArray(accounts) && accounts.length && isAddress(accounts[0]),
    'wallet_unavailable',
  );
  if (payer) assert(same(accounts[0], payer), 'wallet_changed');
  return accounts[0] as string;
}
export async function prepareCheckout(
  backend: CheckoutBackend,
  provider: WalletProvider,
  sessionId: string,
  renew = false,
): Promise<PreparedCheckout> {
  const payer = await walletIdentity(provider, undefined, true);
  const session = await backend.session(sessionId);
  assert(session.id === sessionId);
  const quote = await backend.quote(sessionId, payer, renew);
  const display = validateCheckoutQuote(quote, session, payer);
  const balance = await provider.request({
    method: 'eth_call',
    params: [
      {
        to: TOKEN,
        data: '0x70a08231' + payer.slice(2).toLowerCase().padStart(64, '0'),
      },
      'latest',
    ],
  });
  assert(
    typeof balance === 'string' && /^0x[0-9a-fA-F]+$/.test(balance),
    'balance_unavailable',
  );
  assert(
    BigInt(balance) >= BigInt(quote.tokenTypedData.message.value),
    'insufficient_usdt',
  );
  const result = JSON.parse(JSON.stringify({ session, quote, payer, display }));
  const freeze = (v: any) => {
    if (v && typeof v === 'object') {
      Object.values(v).forEach(freeze);
      Object.freeze(v);
    }
    return v;
  };
  return freeze(result);
}
export async function signCheckout(
  p: PreparedCheckout,
  provider: WalletProvider,
  backend: CheckoutBackend,
  isActive: () => boolean = () => true,
) {
  const signatures: string[] = [];
  for (const td of [p.quote.typedData, p.quote.tokenTypedData]) {
    assert(isActive(), 'checkout_cancelled');
    await walletIdentity(provider, p.payer);
    assert(isActive(), 'checkout_cancelled');
    validateCheckoutQuote(p.quote, p.session, p.payer);
    let signature: string;
    try {
      signature = await provider.request({
        method: 'eth_signTypedData_v4',
        params: [p.payer, JSON.stringify(td)],
      });
    } catch (e) {
      throw new Error(
        (e as any)?.code === 4001
          ? 'signature_rejected'
          : 'wallet_signing_failed',
      );
    }
    assert(/^0x[0-9a-fA-F]{130}$/.test(signature), 'invalid_signature');
    assert(
      same(await recoverTypedDataAddress({ ...td, signature }), p.payer),
      'invalid_signature',
    );
    assert(isActive(), 'checkout_cancelled');
    signatures.push(signature);
  }
  await walletIdentity(provider, p.payer);
  validateCheckoutQuote(p.quote, p.session, p.payer);
  assert(isActive(), 'checkout_cancelled');
  await backend.submit(p.session.id, p.quote.submissionId, {
    orderSignature: signatures[0],
    tokenSignature: signatures[1],
  });
}
export function confirmedPayment(
  status: PaymentStatus,
  session: CheckoutSessionView,
) {
  if (status.sessionStatus !== 'settled') return null;
  const p = status.payment;
  assert(
    p &&
      p.status === 'succeeded' &&
      p.sessionId === session.id &&
      p.amountMinor === session.amountMinor &&
      typeof p.id === 'string' &&
      /^0x[0-9a-fA-F]{64}$/.test(p.txHash) &&
      Number.isSafeInteger(p.blockNumber) &&
      p.blockNumber > 0,
    'invalid_confirmation',
  );
  return { paymentId: p.id, txHash: p.txHash };
}
export function createCheckoutClient(
  basePath = '/api/whitepay',
): CheckoutBackend {
  assert(/^\/(?!\/)[a-zA-Z0-9/_-]+$/.test(basePath), 'invalid_backend_path');
  const route = (id: string) => {
    assert(/^cs_[a-zA-Z0-9]+$/.test(id), 'invalid_session');
    return `${basePath}/sessions/${id}`;
  };
  const request = async (path: string, body?: unknown) => {
    let res: Response;
    try {
      res = await fetch(path, {
        method: body === undefined ? 'GET' : 'POST',
        credentials: 'same-origin',
        redirect: 'error',
        headers:
          body === undefined
            ? { accept: 'application/json' }
            : {
                accept: 'application/json',
                'content-type': 'application/json',
              },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      throw new Error('checkout_network_error');
    }
    if (!res.ok) {
      let code: string | undefined;
      try {
        code = (await res.json()).error;
      } catch {}
      throw new Error(
        code === 'quote_expired' ? 'quote_expired' : 'checkout_request_failed',
      );
    }
    if (res.status === 204) return;
    return res.json();
  };
  return {
    session: (id) => request(route(id)),
    quote: (id, payerAddress, renew = false) =>
      request(route(id) + '/quote', { payerAddress, renew }),
    submit: (id, submissionId, signatures) =>
      request(route(id) + '/signatures', { submissionId, ...signatures }),
    status: (id) => request(route(id) + '/status'),
  };
}
