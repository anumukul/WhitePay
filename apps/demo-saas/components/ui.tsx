import type { ReactNode } from 'react';
export function Icon({
  name = 'spark',
  size = 20,
}: {
  name?: string;
  size?: number;
}) {
  const paths: Record<string, ReactNode> = {
    spark: (
      <>
        <path d="m12 3 2.7 6.3L21 12l-6.3 2.7L12 21l-2.7-6.3L3 12l6.3-2.7Z" />
        <path d="M20 2v4m-2-2h4" />
      </>
    ),
    grid: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="2" />
        <rect x="14" y="3" width="7" height="7" rx="2" />
        <rect x="3" y="14" width="7" height="7" rx="2" />
        <rect x="14" y="14" width="7" height="7" rx="2" />
      </>
    ),
    credit: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="3" />
        <path d="M3 10h18M7 15h3" />
      </>
    ),
    bolt: <path d="m13 2-8 12h6l-1 8 9-13h-6Z" />,
    arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
    check: <path d="m5 12 4 4L19 6" />,
    shield: (
      <>
        <path d="m12 3 8 3v6c0 4-5 8-8 9-3-1-8-5-8-9V6Z" />
        <path d="m8 12 3 3 5-5" />
      </>
    ),
    layers: (
      <>
        <path d="m12 3 10 5-10 5L2 8Zm-10 9 10 5 10-5M2 16l10 5 10-5" />
      </>
    ),
    globe: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18Z" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] ?? paths.spark}
    </svg>
  );
}
export function TestnetNote() {
  return (
    <div className="network-note">
      <span className="status-dot" />
      Whitechain Sepolia <span className="muted">· Testnet assets only</span>
    </div>
  );
}
export function OrderSummary() {
  return (
    <div className="order-summary">
      <div className="pack-icon">
        <Icon name="layers" size={28} />
      </div>
      <p className="eyebrow">THE EVERYDAY PACK</p>
      <h3>100 creative credits</h3>
      <p className="muted">A fresh supply for your next good idea.</p>
      <dl className="price-lines">
        <div>
          <dt>100 credits</dt>
          <dd>5 USDT</dd>
        </div>
        <div>
          <dt>Sponsorship fee</dt>
          <dd>0.005 USDT</dd>
        </div>
        <div className="price-total">
          <dt>Total payment</dt>
          <dd>
            5.005 <span>USDT</span>
          </dd>
        </div>
      </dl>
      <p className="small muted">
        The relayer covers WBT gas. You pay the total above in official test
        USDT.
      </p>
      <TestnetNote />
    </div>
  );
}
