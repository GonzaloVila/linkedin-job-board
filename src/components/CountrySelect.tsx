'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';

export function CountrySelect({
  countries,
  active,
}: {
  countries: string[];
  active: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [, startTransition] = useTransition();

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = new URLSearchParams(params.toString());
    if (e.target.value) next.set('country', e.target.value);
    else next.delete('country');
    startTransition(() => {
      router.replace(`/?${next.toString()}`, { scroll: false });
    });
  }

  return (
    <select
      value={active}
      onChange={onChange}
      className={[
        'w-full sm:w-48 px-3 py-1.5',
        'bg-[color:var(--color-surface)] border border-[color:var(--color-border)]',
        'rounded-sm text-sm font-mono',
        active
          ? 'text-[color:var(--color-ink)]'
          : 'text-[color:var(--color-ink-dim)]',
        'focus:outline-none focus:border-[color:var(--color-amber-dim)]',
        'transition-colors',
      ].join(' ')}
    >
      <option value="">todos los países</option>
      {countries.map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
    </select>
  );
}
