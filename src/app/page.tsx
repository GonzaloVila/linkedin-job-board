import { Suspense } from 'react';
import { sql, type Job } from '@/lib/db';
import { JobCard } from '@/components/JobCard';
import { FilterTabs } from '@/components/FilterTabs';
import { SearchInput } from '@/components/SearchInput';
import { CountrySelect } from '@/components/CountrySelect';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type SearchParams = Promise<{ status?: string; q?: string; country?: string }>;

const VALID_STATUS = new Set([
  'pending',
  'interested',
  'applied',
  'dismissed',
  'all',
]);

export default async function Page({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { status = 'pending', q = '', country = '' } = await searchParams;
  const activeStatus = VALID_STATUS.has(status) ? status : 'pending';
  const query = q.trim();
  const activeCountry = country.trim();

  // Fetch the recent universe — last 200 rows is plenty for personal use.
  const all = (await sql<Job[]>`
    SELECT
      external_id, title, company, location, url,
      posted_at, search_keyword, notified_at, status
    FROM jobs_seen
    ORDER BY notified_at DESC
    LIMIT 200
  `) as unknown as Job[];

  // Extract country from location: last segment after the last comma.
  function extractCountry(location: string | null): string | null {
    if (!location) return null;
    const parts = location.split(',');
    return parts[parts.length - 1].trim();
  }

  // Unique sorted country list for the dropdown.
  const countries = [
    ...new Set(
      all.map((j) => extractCountry(j.location)).filter(Boolean) as string[]
    ),
  ].sort((a, b) => a.localeCompare(b, 'es'));

  // Apply country filter first so tab counts reflect the selection.
  const countryFiltered = activeCountry
    ? all.filter((j) => extractCountry(j.location) === activeCountry)
    : all;

  // Counts for the tabs (scoped to active country)
  const counts = {
    all: countryFiltered.length,
    pending: countryFiltered.filter(
      (j) => j.status === 'new' || j.status === 'interested'
    ).length,
    interested: countryFiltered.filter((j) => j.status === 'interested').length,
    applied: countryFiltered.filter((j) => j.status === 'applied').length,
    dismissed: countryFiltered.filter((j) => j.status === 'dismissed').length,
  };

  // Filtering
  const filtered = countryFiltered.filter((j) => {
    if (activeStatus === 'pending') {
      if (j.status !== 'new' && j.status !== 'interested') return false;
    } else if (activeStatus !== 'all' && j.status !== activeStatus) {
      return false;
    }
    if (query) {
      const haystack = `${j.title} ${j.company}`.toLowerCase();
      if (!haystack.includes(query.toLowerCase())) return false;
    }
    return true;
  });

  return (
    <main className="min-h-screen">
      <div className="max-w-5xl mx-auto px-6 sm:px-10 py-12 sm:py-16">
        {/* Header */}
        <header className="mb-12">
          <div className="flex items-baseline justify-between gap-6 mb-3 flex-wrap">
            <h1 className="flex items-baseline gap-3">
              <span
                style={{ fontFamily: 'var(--font-display)' }}
                className="text-4xl sm:text-5xl italic font-light tracking-tight"
              >
                job board
              </span>
              <span className="font-mono text-xs text-[color:var(--color-ink-dim)] tracking-widest">
                · LINKEDIN BOT
              </span>
            </h1>
            <div className="font-mono text-[11px] text-[color:var(--color-ink-dim)] tracking-wider tabular-nums">
              {counts.all} JOBS · {counts.pending} PENDING · {counts.applied} APPLIED
            </div>
          </div>

          <p className="text-sm text-[color:var(--color-ink-muted)] max-w-prose">
            Vacantes scrapeadas en las últimas semanas. Marcá las que aplicaste
            y las que descartás — vuelven a aparecer solo si las pedís.
          </p>

          <div className="hairline mt-8" />
        </header>

        {/* Filter row */}
        <div className="flex flex-col sm:flex-row gap-4 sm:items-center sm:justify-between mb-8">
          <Suspense fallback={null}>
            <FilterTabs active={activeStatus} counts={counts} query={query} />
          </Suspense>
          <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
            <Suspense fallback={null}>
              <CountrySelect countries={countries} active={activeCountry} />
            </Suspense>
            <Suspense fallback={null}>
              <SearchInput initialQuery={query} />
            </Suspense>
          </div>
        </div>

        {/* Job list */}
        {filtered.length === 0 ? (
          <EmptyState query={query} status={activeStatus} />
        ) : (
          <div className="flex flex-col gap-3">
            {filtered.map((job) => (
              <JobCard key={job.external_id} job={job} />
            ))}
          </div>
        )}

        {/* Footer */}
        <footer className="mt-16 pt-8 border-t border-[color:var(--color-border)] flex items-center justify-between text-[10px] font-mono tracking-widest text-[color:var(--color-ink-dim)] uppercase">
          <span>last 200 rows</span>
          <span>scraping every 1h · github actions</span>
        </footer>
      </div>
    </main>
  );
}

function EmptyState({ query, status }: { query: string; status: string }) {
  let message: string;
  if (query) {
    message = `Sin resultados para "${query}".`;
  } else if (status === 'applied') {
    message = 'Todavía no marcaste ninguna vacante como aplicada.';
  } else if (status === 'dismissed') {
    message = 'No descartaste nada — perfecto, listo para triagear.';
  } else if (status === 'pending') {
    message = 'Cero pendientes. Estás al día. ✓';
  } else {
    message = 'No hay nada acá todavía. Esperá a que el bot encuentre algo.';
  }

  return (
    <div className="border border-dashed border-[color:var(--color-border)] rounded-sm py-20 text-center">
      <p
        style={{ fontFamily: 'var(--font-display)' }}
        className="text-2xl italic text-[color:var(--color-ink-muted)]"
      >
        {message}
      </p>
    </div>
  );
}
