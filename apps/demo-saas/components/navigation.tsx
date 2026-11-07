'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon } from './ui';
export function Navigation() {
  const path = usePathname();
  return (
    <aside className="sidebar">
      <Link className="brand" href="/" aria-label="Forma home">
        <span className="brand-mark">
          <Icon size={24} />
        </span>
        forma<span className="brand-period">.</span>
      </Link>
      <p className="sidebar-label">YOUR WORKSPACE</p>
      <nav aria-label="Main navigation">
        {[
          { href: '/', label: 'Overview', icon: 'grid' },
          { href: '/credits', label: 'My credits', icon: 'bolt' },
          { href: '/checkout', label: 'Get credits', icon: 'credit' },
        ].map((x) => (
          <Link
            key={x.href}
            href={x.href}
            aria-current={
              (x.href === '/' ? path === '/' : path.startsWith(x.href))
                ? 'page'
                : undefined
            }
          >
            <Icon name={x.icon} />
            <span>{x.label}</span>
            {x.href === '/checkout' && <span className="nav-plus">+</span>}
          </Link>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <div className="sidebar-tip">
          <Icon name="shield" />
          <strong>Your wallet. Your control.</strong>
          <p>Pay with USDT. Your relayer takes care of the gas.</p>
        </div>
        <div className="sidebar-network">
          <span className="status-dot" />
          Sepolia testnet <span className="small">1874</span>
        </div>
      </div>
    </aside>
  );
}
