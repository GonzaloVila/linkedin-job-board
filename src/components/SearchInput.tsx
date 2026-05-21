'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useTransition, useEffect } from 'react';

export function SearchInput({ initialQuery }: { initialQuery: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const [value, setValue] = useState(initialQuery);
  const [, startTransition] = useTransition();

  // Debounced URL update
  useEffect(() => {
    const t = setTimeout(() => {
      const next = new URLSearchParams(params.toString());
      if (value) next.set('q', value);
      else next.delete('q');
      next.delete('page');
      startTransition(() => {
        router.replace(`/?${next.toString()}`, { scroll: false });
      });
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div className="relative w-full sm:w-72">
      <span
        aria-hidden
        className="absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--color-ink-dim)] font-mono text-xs select-none"
      >
        /
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="buscar título o empresa…"
        className={[
          'w-full pl-7 pr-3 py-1.5',
          'bg-[color:var(--color-surface)] border border-[color:var(--color-border)]',
          'rounded-sm text-sm text-[color:var(--color-ink)]',
          'placeholder:text-[color:var(--color-ink-dim)]',
          'focus:outline-none focus:border-[color:var(--color-amber-dim)]',
          'transition-colors',
        ].join(' ')}
      />
    </div>
  );
}
