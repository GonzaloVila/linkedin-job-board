import { Suspense } from 'react';
import Link from 'next/link';
import { sql, type Job } from '@/lib/db';
import { JobCard } from '@/components/JobCard';
import { FilterTabs } from '@/components/FilterTabs';
import { SearchInput } from '@/components/SearchInput';
import { LanguageGroupSelect } from '@/components/CountrySelect';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const PAGE_SIZE = 20;

type SearchParams = Promise<{
  status?: string;
  q?: string;
  lang?: string;
  page?: string;
}>;

const VALID_STATUS = new Set([
  'pending', 'interested', 'applied', 'dismissed', 'all',
]);

export default async function Page({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { status = 'pending', q = '', lang = '', page: pageParam = '1' } =
    await searchParams;
  const activeStatus = VALID_STATUS.has(status) ? status : 'pending';
  const query = q.trim();
  const activeLang = (['ar', 'es', 'en'] as string[]).includes(lang) ? lang : '';
  const page = Math.max(1, parseInt(pageParam, 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  // Dynamic WHERE fragments
  const statusWhere =
    activeStatus === 'pending'
      ? sql`status IN ('new', 'interested')`
      : activeStatus === 'all'
      ? sql`TRUE`
      : sql`status = ${activeStatus}`;

  const langWhere =
    activeLang === 'ar'
      ? sql`location ILIKE '%argentina%'`
      : activeLang
      ? sql`language_group = ${activeLang}`
      : sql`TRUE`;

  const textWhere = query
    ? sql`(title ILIKE ${'%' + query + '%'} OR company ILIKE ${'%' + query + '%'})`
    : sql`TRUE`;

  const [jobs, countsRows] = (await Promise.all([
    sql<Job[]>`
      SELECT external_id, title, company, location, url,
             posted_at, search_keyword, language_group, source, notified_at, status,
             analysis_json, match_score, match_reasoning, analyzed_at
      FROM jobs_seen
      WHERE ${statusWhere} AND ${langWhere} AND ${textWhere}
      ORDER BY
        CASE WHEN title ~* '\y(junior|trainee|intern|pasante|pasantía|practicante|aprendiz|jr\.?|ssr)\y'
             THEN 0 ELSE 1 END,
        notified_at DESC
      LIMIT ${PAGE_SIZE + 1} OFFSET ${offset}
    `,
    sql`
      SELECT
        COUNT(*) FILTER (WHERE status IN ('new', 'interested')) AS pending,
        COUNT(*) FILTER (WHERE status = 'interested')           AS interested,
        COUNT(*) FILTER (WHERE status = 'applied')              AS applied,
        COUNT(*) FILTER (WHERE status = 'dismissed')            AS dismissed,
        COUNT(*)                                                AS all
      FROM jobs_seen
      WHERE ${langWhere}
    `,
  ])) as unknown as [Job[], Record<string, string>[]];

  const hasNext = jobs.length > PAGE_SIZE;
  const pageJobs = hasNext ? (jobs as Job[]).slice(0, PAGE_SIZE) : (jobs as Job[]);

  const counts = {
    pending:    Number(countsRows[0]?.pending    ?? 0),
    interested: Number(countsRows[0]?.interested ?? 0),
    applied:    Number(countsRows[0]?.applied    ?? 0),
    dismissed:  Number(countsRows[0]?.dismissed  ?? 0),
    all:        Number(countsRows[0]?.all        ?? 0),
  };

  const baseParams = new URLSearchParams();
  if (activeStatus !== 'pending') baseParams.set('status', activeStatus);
  if (query) baseParams.set('q', query);
  if (activeLang) baseParams.set('lang', activeLang);

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
            <FilterTabs
              active={activeStatus}
              counts={counts}
              query={query}
              lang={activeLang}
            />
          </Suspense>
          <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
            <Suspense fallback={null}>
              <LanguageGroupSelect active={activeLang} />
            </Suspense>
            <Suspense fallback={null}>
              <SearchInput initialQuery={query} />
            </Suspense>
          </div>
        </div>

        {/* Job list */}
        {pageJobs.length === 0 ? (
          <EmptyState query={query} status={activeStatus} />
        ) : (
          <div className="flex flex-col gap-3">
            {pageJobs.map((job) => (
              <JobCard key={job.external_id} job={job} />
            ))}
          </div>
        )}

        {/* Pagination */}
        {(page > 1 || hasNext) && (
          <Pagination page={page} hasNext={hasNext} baseParams={baseParams} />
        )}

        {/* Footer */}
        <footer className="mt-16 pt-8 border-t border-[color:var(--color-border)] flex items-center justify-between text-[10px] font-mono tracking-widest text-[color:var(--color-ink-dim)] uppercase">
          <span>{PAGE_SIZE} por página</span>
          <span>scraping every 1h · github actions</span>
        </footer>
      </div>
    </main>
  );
}

function Pagination({
  page,
  hasNext,
  baseParams,
}: {
  page: number;
  hasNext: boolean;
  baseParams: URLSearchParams;
}) {
  const prevParams = new URLSearchParams(baseParams);
  if (page - 1 > 1) prevParams.set('page', String(page - 1));
  else prevParams.delete('page');

  const nextParams = new URLSearchParams(baseParams);
  nextParams.set('page', String(page + 1));

  return (
    <div className="flex items-center justify-center gap-6 mt-10 font-mono text-sm text-[color:var(--color-ink-muted)]">
      {page > 1 && (
        <Link
          href={`/?${prevParams}`}
          className="hover:text-[color:var(--color-ink)] transition-colors"
        >
          ← anterior
        </Link>
      )}
      <span className="tabular-nums text-[color:var(--color-ink-dim)] text-xs tracking-widest">
        pág. {page}
      </span>
      {hasNext && (
        <Link
          href={`/?${nextParams}`}
          className="hover:text-[color:var(--color-ink)] transition-colors"
        >
          siguiente →
        </Link>
      )}
    </div>
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
