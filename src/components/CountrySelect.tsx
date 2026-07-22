'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';

const GROUPS = [
  { value: '',   label: 'todos los idiomas' },
  { value: 'es', label: 'Español · AR · CL · ES' },
  { value: 'en', label: 'English · US · Worldwide' },
];

export function LanguageGroupSelect({ active }: { active: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const [, startTransition] = useTransition();

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = new URLSearchParams(params.toString());
    if (e.target.value) next.set('lang', e.target.value);
    else next.delete('lang');
    next.delete('page');
    startTransition(() => {
      router.replace(`/?${next.toString()}`, { scroll: false });
    });
  }

  return (
    <select
      value={active}
      onChange={onChange}
      className={[
        'w-full sm:w-52 px-3 py-1.5',
        'bg-[color:var(--color-surface)] border border-[color:var(--color-border)]',
        'rounded-sm text-sm font-mono',
        active
          ? 'text-[color:var(--color-ink)]'
          : 'text-[color:var(--color-ink-dim)]',
        'focus:outline-none focus:border-[color:var(--color-amber-dim)]',
        'transition-colors',
      ].join(' ')}
    >
      {GROUPS.map((g) => (
        <option key={g.value} value={g.value}>
          {g.label}
        </option>
      ))}
    </select>
  );
}
