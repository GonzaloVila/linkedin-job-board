import { login } from './actions';

type SearchParams = Promise<{ error?: string }>;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { error } = await searchParams;

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-xs">
        <h1
          style={{ fontFamily: 'var(--font-display)' }}
          className="text-4xl italic font-light tracking-tight mb-8 text-[color:var(--color-ink)]"
        >
          job board
        </h1>

        <form action={login} className="flex flex-col gap-3">
          <input
            type="password"
            name="password"
            placeholder="password"
            autoFocus
            autoComplete="current-password"
            className={[
              'w-full px-3 py-2',
              'bg-[color:var(--color-surface)] border border-[color:var(--color-border)]',
              'rounded-sm text-sm font-mono text-[color:var(--color-ink)]',
              'placeholder:text-[color:var(--color-ink-dim)]',
              'focus:outline-none focus:border-[color:var(--color-amber-dim)]',
              'transition-colors',
            ].join(' ')}
          />

          {error && (
            <p className="text-xs font-mono text-[color:var(--color-ink-dim)]">
              password incorrecto.
            </p>
          )}

          <button
            type="submit"
            className={[
              'w-full py-2 px-3',
              'bg-[color:var(--color-amber)] text-[color:var(--color-canvas)]',
              'rounded-sm text-sm font-mono tracking-wider',
              'hover:opacity-90 transition-opacity',
            ].join(' ')}
          >
            entrar
          </button>
        </form>
      </div>
    </main>
  );
}
