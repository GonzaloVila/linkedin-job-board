import Link from 'next/link';

type Counts = {
  pending: number;
  interested: number;
  applied: number;
  dismissed: number;
  all: number;
};

const TABS = [
  { id: 'pending',    label: 'Pendientes' },
  { id: 'interested', label: 'Interesado' },
  { id: 'applied',    label: 'Aplicado' },
  { id: 'dismissed',  label: 'Descartado' },
  { id: 'all',        label: 'Todo' },
] as const;

export function FilterTabs({
  active,
  counts,
  query,
  lang,
}: {
  active: string;
  counts: Counts;
  query: string;
  lang: string;
}) {
  return (
    <nav className="flex flex-wrap gap-1 items-center">
      {TABS.map((tab) => {
        const isActive = active === tab.id;
        const count = counts[tab.id as keyof Counts];
        const params = new URLSearchParams();
        params.set('status', tab.id);
        if (query) params.set('q', query);
        if (lang) params.set('lang', lang);

        return (
          <Link
            key={tab.id}
            href={`/?${params.toString()}`}
            className={[
              'group inline-flex items-baseline gap-2 px-3 py-1.5 rounded-sm',
              'text-sm transition-colors',
              isActive
                ? 'bg-[color:var(--color-surface-2)] text-[color:var(--color-ink)]'
                : 'text-[color:var(--color-ink-muted)] hover:text-[color:var(--color-ink)]',
            ].join(' ')}
          >
            <span>{tab.label}</span>
            <span
              className={[
                'font-mono text-[11px] tabular-nums',
                isActive
                  ? 'text-[color:var(--color-amber)]'
                  : 'text-[color:var(--color-ink-dim)]',
              ].join(' ')}
            >
              {count}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
