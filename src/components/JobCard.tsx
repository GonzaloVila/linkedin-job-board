'use client';

import { useTransition } from 'react';
import { updateJobStatus } from '@/app/actions';
import type { Job, JobStatus } from '@/lib/db';

const STATUS_LABEL: Record<JobStatus, string> = {
  new: 'NUEVO',
  interested: 'INTERESADO',
  applied: 'APLICADO',
  dismissed: 'DESCARTADO',
};

const STATUS_COLOR: Record<JobStatus, string> = {
  new: 'text-[color:var(--color-new)]',
  interested: 'text-[color:var(--color-interested)]',
  applied: 'text-[color:var(--color-applied)]',
  dismissed: 'text-[color:var(--color-dismissed)]',
};

function formatDate(date: Date | string | null): string {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '—';
  const now = new Date();
  const diffH = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60));
  if (diffH < 1) return 'recién';
  if (diffH < 24) return `${diffH}h`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 30) return `${diffD}d`;
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
}

export function JobCard({ job }: { job: Job }) {
  const [pending, startTransition] = useTransition();

  const setStatus = (status: JobStatus) => {
    startTransition(async () => {
      await updateJobStatus(job.external_id, status);
    });
  };

  return (
    <article
      className={[
        'card-hover',
        'border border-[color:var(--color-border)]',
        'bg-[color:var(--color-surface)]',
        'rounded-sm p-5',
        'flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between',
        pending ? 'opacity-50' : '',
      ].join(' ')}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-3 flex-wrap mb-1">
          <span
            className={[
              'font-mono text-[10px] tracking-widest',
              STATUS_COLOR[job.status],
            ].join(' ')}
          >
            {STATUS_LABEL[job.status]}
          </span>
          <span className="font-mono text-[10px] text-[color:var(--color-ink-dim)] tracking-wider">
            #{job.external_id}
          </span>
          <span className="font-mono text-[10px] text-[color:var(--color-ink-dim)]">
            · {formatDate(job.notified_at)}
          </span>
        </div>

        <h3 className="text-lg leading-snug mb-1">
          <a
            href={job.url}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-[color:var(--color-amber)] transition-colors"
          >
            {job.title}
          </a>
        </h3>

        <div className="text-sm text-[color:var(--color-ink-muted)] flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-[color:var(--color-ink)]">{job.company}</span>
          {job.location && (
            <>
              <span aria-hidden className="text-[color:var(--color-ink-dim)]">
                ·
              </span>
              <span>{job.location}</span>
            </>
          )}
          {job.search_keyword && (
            <>
              <span aria-hidden className="text-[color:var(--color-ink-dim)]">
                ·
              </span>
              <span className="font-mono text-[11px] text-[color:var(--color-ink-dim)]">
                {job.search_keyword}
              </span>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        <ActionButton
          label="Interesado"
          isActive={job.status === 'interested'}
          onClick={() => setStatus('interested')}
        />
        <ActionButton
          label="Aplicado"
          isActive={job.status === 'applied'}
          onClick={() => setStatus('applied')}
          variant="amber"
        />
        <ActionButton
          label="Descartar"
          isActive={job.status === 'dismissed'}
          onClick={() => setStatus('dismissed')}
          variant="dim"
        />
        <a
          href={job.url}
          target="_blank"
          rel="noopener noreferrer"
          className={[
            'inline-flex items-center gap-1 px-2.5 py-1 rounded-sm',
            'text-xs font-mono',
            'border border-[color:var(--color-border-bright)]',
            'text-[color:var(--color-ink)] hover:text-[color:var(--color-amber)]',
            'hover:border-[color:var(--color-amber-dim)] transition-colors',
            'ml-1',
          ].join(' ')}
        >
          abrir ↗
        </a>
      </div>
    </article>
  );
}

function ActionButton({
  label,
  isActive,
  onClick,
  variant = 'default',
}: {
  label: string;
  isActive: boolean;
  onClick: () => void;
  variant?: 'default' | 'amber' | 'dim';
}) {
  const base =
    'px-2.5 py-1 rounded-sm text-xs transition-colors border';

  let active: string;
  if (variant === 'amber') {
    active =
      'bg-[color:var(--color-amber)] text-[color:var(--color-canvas)] border-[color:var(--color-amber)]';
  } else if (variant === 'dim') {
    active =
      'bg-[color:var(--color-surface-2)] text-[color:var(--color-ink-dim)] border-[color:var(--color-border-bright)]';
  } else {
    active =
      'bg-[color:var(--color-surface-2)] text-[color:var(--color-ink)] border-[color:var(--color-border-bright)]';
  }

  const inactive =
    'text-[color:var(--color-ink-muted)] border-transparent hover:text-[color:var(--color-ink)] hover:border-[color:var(--color-border)]';

  return (
    <button
      type="button"
      onClick={onClick}
      className={`${base} ${isActive ? active : inactive}`}
    >
      {label}
    </button>
  );
}
