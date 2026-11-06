import { useEffect, useId, useMemo, useState } from 'react';
import Link from 'next/link';
interface Entry {
  route: string;
  title: string;
  content: string;
}
export function DocsSearch({ className }: { className?: string }) {
  const [query, setQuery] = useState('');
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [failed, setFailed] = useState(false);
  const id = useId();
  useEffect(() => {
    const controller = new AbortController();
    fetch('/search-index.json', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('search unavailable');
        setEntries(await response.json());
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, []);
  const value = query.trim().toLowerCase();
  const results = useMemo(
    () =>
      !value || !entries
        ? []
        : entries
            .filter((entry) =>
              `${entry.title} ${entry.content}`.toLowerCase().includes(value),
            )
            .sort(
              (a, b) =>
                Number(b.title.toLowerCase().includes(value)) -
                Number(a.title.toLowerCase().includes(value)),
            )
            .slice(0, 8),
    [entries, value],
  );
  return (
    <div className={className} style={{ position: 'relative' }}>
      <input
        type="search"
        role="combobox"
        aria-label="Search documentation"
        aria-controls={id}
        aria-expanded={Boolean(value)}
        autoComplete="off"
        placeholder="Search documentation…"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setQuery('');
        }}
        style={{
          width: '100%',
          padding: '8px 12px',
          borderRadius: 8,
          border: '1px solid #aaa',
          background: 'transparent',
          color: 'inherit',
        }}
      />
      {value && (
        <div
          id={id}
          role="listbox"
          aria-label="Documentation search results"
          style={{
            position: 'absolute',
            right: 0,
            top: '100%',
            width: 'min(350px,85vw)',
            maxHeight: '60vh',
            overflowY: 'auto',
            zIndex: 50,
            padding: 12,
            border: '1px solid #aaa',
            borderRadius: 8,
            background: 'rgb(var(--nextra-bg))',
            boxShadow: '0 8px 24px #0002',
          }}
        >
          {!entries && !failed && <p role="status">Loading search…</p>}
          {failed && (
            <p role="status">Search is unavailable. Use the navigation menu.</p>
          )}
          {entries && !results.length && <p role="status">No results found.</p>}
          {results.map((entry) => (
            <Link
              key={entry.route}
              role="option"
              aria-selected={false}
              href={entry.route}
              onClick={() => setQuery('')}
              style={{ display: 'block', padding: 8, textDecoration: 'none' }}
            >
              <strong>{entry.title}</strong>
              <p style={{ fontSize: 12 }}>
                {entry.content.slice(
                  Math.max(0, entry.content.toLowerCase().indexOf(value) - 30),
                  Math.max(0, entry.content.toLowerCase().indexOf(value) - 30) +
                    150,
                )}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
