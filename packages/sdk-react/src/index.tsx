'use client';
import * as React from 'react';
import {
  createCheckoutClient,
  prepareCheckout,
  signCheckout,
  confirmedPayment,
  type CheckoutBackend,
  type CheckoutSessionView,
  type PreparedCheckout,
  type WalletProvider,
} from './checkout.js';
export * from './checkout.js';
export interface WhitePayCheckoutProps {
  sessionId: string;
  backend?: CheckoutBackend;
  provider?: WalletProvider;
  /** Reserved for compatibility; customer authorization is enforced by your server bridge. */
  publishableKey?: string;
  onComplete?: (result: { paymentId: string; txHash: string }) => void;
  onError?: (error: Error) => void;
  appearance?: { label?: string; buttonStyle?: React.CSSProperties };
}
const messages: Record<string, string> = {
  wrong_chain: 'Switch your wallet to Whitechain Sepolia to continue.',
  wallet_unavailable: 'Connect an Ethereum wallet to continue.',
  wallet_changed: 'Your wallet account changed. Review the payment again.',
  signature_rejected: 'Signature declined. No payment was submitted.',
  quote_expired:
    'This quote expired. Request a fresh quote before authorizing.',
  insufficient_usdt: 'Your wallet does not have enough official test USDT.',
  quote_mismatch: 'The payment terms could not be verified.',
  quote_window_mismatch: 'The payment validity window could not be verified.',
  invalid_confirmation: 'Payment confirmation could not be verified.',
};
export function WhitePayCheckout(
  props: WhitePayCheckoutProps,
): React.ReactElement {
  const backend = React.useMemo(
    () => props.backend ?? createCheckoutClient(),
    [props.backend],
  );
  const [session, setSession] = React.useState<CheckoutSessionView | null>(
    null,
  );
  const [prepared, setPrepared] = React.useState<PreparedCheckout | null>(null);
  const [phase, setPhase] = React.useState<
    | 'loading'
    | 'ready'
    | 'review'
    | 'signing'
    | 'pending'
    | 'complete'
    | 'error'
  >('loading');
  const [error, setError] = React.useState<string | null>(null);
  const [receipt, setReceipt] = React.useState<{
    paymentId: string;
    txHash: string;
  } | null>(null);
  const [now, setNow] = React.useState(() => Math.floor(Date.now() / 1000));
  const generation = React.useRef(0);
  const busy = React.useRef(false),
    completed = React.useRef(false);
  const callbacks = React.useRef(props);
  callbacks.current = props;
  function fail(e: unknown) {
    const code =
      e instanceof Error && messages[e.message] ? e.message : 'checkout_error';
    setError(code);
    setPhase('error');
    callbacks.current.onError?.(new Error(code));
  }
  function finish(result: { paymentId: string; txHash: string }) {
    setReceipt(result);
    setPhase('complete');
    if (!completed.current) {
      completed.current = true;
      callbacks.current.onComplete?.(result);
    }
  }
  React.useEffect(() => {
    generation.current++;
    let stopped = false;
    completed.current = false;
    setPhase('loading');
    setPrepared(null);
    setReceipt(null);
    setError(null);
    backend
      .session(props.sessionId)
      .then(async (s) => {
        if (stopped) return;
        if (s.id !== props.sessionId) throw new Error('quote_mismatch');
        setSession(s);
        if (s.status === 'settled') {
          const result = confirmedPayment(await backend.status(s.id), s);
          if (!stopped && result) finish(result);
          else if (!stopped) throw new Error('invalid_confirmation');
        } else if (s.status === 'open') setPhase('ready');
        else throw new Error('session_closed');
      })
      .catch((e) => {
        if (!stopped) fail(e);
      });
    return () => {
      stopped = true;
      generation.current++;
    };
  }, [backend, props.sessionId]);
  React.useEffect(() => {
    const timer = setInterval(
      () => setNow(Math.floor(Date.now() / 1000)),
      1000,
    );
    return () => clearInterval(timer);
  }, []);
  React.useEffect(() => {
    if (phase !== 'pending' || !prepared) return;
    let stopped = false,
      timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const status = await backend.status(prepared.session.id);
        if (stopped) return;
        const result = confirmedPayment(status, prepared.session);
        if (result) {
          finish(result);
          return;
        }
        if (Date.now() / 1000 > prepared.display.validBefore + 60)
          throw new Error('quote_expired');
        timer = setTimeout(poll, 2000);
      } catch (e) {
        if (!stopped) fail(e);
      }
    };
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [phase, prepared, backend]);
  const provider = () =>
    props.provider ??
    ((globalThis as any).ethereum as WalletProvider | undefined);
  async function review(renew = false) {
    if (busy.current) return;
    busy.current = true;
    const attempt = generation.current;
    setError(null);
    setPhase('loading');
    try {
      const wallet = provider();
      if (!wallet) throw new Error('wallet_unavailable');
      const result = await prepareCheckout(
        backend,
        wallet,
        props.sessionId,
        renew,
      );
      if (attempt !== generation.current) return;
      setPrepared(result);
      setSession(result.session);
      setNow(Math.floor(Date.now() / 1000));
      setPhase('review');
    } catch (e) {
      if (attempt === generation.current) fail(e);
    } finally {
      busy.current = false;
    }
  }
  async function authorize() {
    if (busy.current || !prepared) return;
    busy.current = true;
    const attempt = generation.current;
    setPhase('signing');
    try {
      const wallet = provider();
      if (!wallet) throw new Error('wallet_unavailable');
      await signCheckout(
        prepared,
        wallet,
        backend,
        () => attempt === generation.current,
      );
      if (attempt === generation.current) setPhase('pending');
    } catch (e) {
      if (attempt === generation.current) fail(e);
    } finally {
      busy.current = false;
    }
  }
  const expired =
    prepared !== null && prepared.display.validBefore <= now + 120;
  const style: React.CSSProperties = {
    padding: '12px 20px',
    borderRadius: 6,
    border: 0,
    background: '#111',
    color: '#fff',
    cursor: 'pointer',
    ...props.appearance?.buttonStyle,
  };
  return (
    <section
      aria-label="WhitePay checkout"
      aria-busy={['loading', 'signing', 'pending'].includes(phase)}
    >
      <p>Whitechain Sepolia · Testnet</p>
      {phase === 'loading' && <p role="status">Loading checkout…</p>}
      {error && (
        <p role="alert">
          {messages[error] ?? 'Checkout could not continue. Please retry.'}
        </p>
      )}
      {session && (
        <p>
          Merchant: <span>{session.payoutAddress}</span>
        </p>
      )}
      {phase === 'ready' && (
        <button type="button" style={style} onClick={() => void review()}>
          {props.appearance?.label ?? 'Review payment'}
        </button>
      )}
      {prepared && ['review', 'signing', 'pending'].includes(phase) && (
        <>
          <dl>
            <dt>Price</dt>
            <dd>{prepared.display.amount} USDT</dd>
            <dt>Sponsorship fee</dt>
            <dd>{prepared.display.fee} USDT</dd>
            <dt>Total</dt>
            <dd>{prepared.display.total} USDT</dd>
          </dl>
          <p>
            The relayer pays WBT gas. You do not need WBT or a token approval.
          </p>
          <p>Official USDT: {prepared.session.tokenAddress}</p>
          <p>
            Quote expires{' '}
            <time
              dateTime={new Date(
                prepared.display.validBefore * 1000,
              ).toISOString()}
            >
              {new Date(
                prepared.display.validBefore * 1000,
              ).toLocaleTimeString()}
            </time>
            .
          </p>
        </>
      )}
      {phase === 'review' &&
        (expired ? (
          <>
            <p role="alert">
              This quote is too close to expiry to authorize safely.
            </p>
            <button type="button" onClick={() => void review(true)}>
              Refresh quote
            </button>
          </>
        ) : (
          <button type="button" style={style} onClick={() => void authorize()}>
            Authorize {prepared!.display.total} USDT
          </button>
        ))}
      {phase === 'signing' && (
        <p role="status">
          Confirm the two payment authorizations in your wallet…
        </p>
      )}
      {phase === 'pending' && (
        <p role="status">
          Authorizations submitted. Waiting for relayer execution and confirmed
          settlement…
        </p>
      )}
      {phase === 'complete' && receipt && (
        <>
          <p role="status">Payment confirmed.</p>
          <a
            href={`https://explorer.testnet.whitechain.io/tx/${receipt.txHash}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            View receipt
          </a>
          <p>Your merchant confirms delivery separately.</p>
        </>
      )}
      {phase === 'error' && (
        <button
          type="button"
          onClick={() => void review(error === 'quote_expired')}
        >
          Review again
        </button>
      )}
      {error === 'wrong_chain' && (
        <button
          type="button"
          onClick={() => {
            const wallet = provider();
            if (wallet)
              void wallet
                .request({
                  method: 'wallet_switchEthereumChain',
                  params: [{ chainId: '0x752' }],
                })
                .then(() => review())
                .catch(() => fail(new Error('wrong_chain')));
          }}
        >
          Switch to Whitechain Sepolia
        </button>
      )}
    </section>
  );
}
export function buildRedirectUrl(sessionId: string): string {
  if (!/^cs_[a-zA-Z0-9]+$/.test(sessionId))
    throw new Error('Invalid sessionId format');
  return `/checkout/${sessionId}`;
}
