'use client';

import { useState, useTransition } from 'react';
import { updateJobStatus } from '@/app/actions';
import { analyzeJob } from '@/app/actions/ai';
import type { Job, JobStatus, JobAnalysis } from '@/lib/db';
import { JobAnalysisPanel } from './JobAnalysisPanel';
import { CoverLetterModal } from './CoverLetterModal';

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

function scoreColor(score: number): string {
  if (score >= 70) return '#C9D9A3';
  if (score >= 40) return '#E8B17C';
  return '#E07070';
}

type AnalysisState = {
  analysis: JobAnalysis;
  match: { score: number; reasoning: string };
};

export function JobCard({ job }: { job: Job }) {
  const [statusPending, startStatusTransition] = useTransition();
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisData, setAnalysisData] = useState<AnalysisState | null>(
    job.analyzed_at && job.analysis_json
      ? { analysis: job.analysis_json, match: { score: job.match_score!, reasoning: job.match_reasoning! } }
      : null,
  );
  const [showPanel, setShowPanel] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);

  const isAnalyzed = analysisData !== null;

  const setStatus = (status: JobStatus) => {
    startStatusTransition(async () => {
      await updateJobStatus(job.external_id, status);
    });
  };

  const handleAnalyze = async () => {
    setAnalyzeError(null);
    setAnalyzing(true);
    try {
      const result = await analyzeJob(job.external_id);
      setAnalysisData(result);
      setShowPanel(true);
    } catch (e) {
      setAnalyzeError(e instanceof Error ? e.message : 'Error al analizar.');
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <>
      <article
        className={[
          'card-hover',
          'border border-[color:var(--color-border)]',
          'bg-[color:var(--color-surface)]',
          'rounded-sm p-5',
          'flex flex-col gap-4',
          statusPending ? 'opacity-50' : '',
        ].join(' ')}
      >
        {/* Top row: metadata + action buttons */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-3 flex-wrap mb-1">
              <span className={['font-mono text-[10px] tracking-widest', STATUS_COLOR[job.status]].join(' ')}>
                {STATUS_LABEL[job.status]}
              </span>
              <span className="font-mono text-[10px] text-[color:var(--color-ink-dim)] tracking-wider">
                #{job.external_id}
              </span>
              <span className="font-mono text-[10px] text-[color:var(--color-ink-dim)]">
                · {formatDate(job.notified_at)}
              </span>

              {/* Match score badge */}
              {isAnalyzed && (
                <span
                  className="font-mono text-[10px] tracking-wider px-1.5 py-0.5 rounded-sm"
                  style={{
                    color: scoreColor(analysisData.match.score),
                    border: `1px solid ${scoreColor(analysisData.match.score)}40`,
                    background: `${scoreColor(analysisData.match.score)}14`,
                  }}
                >
                  {analysisData.match.score}% match
                </span>
              )}
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
                  <span aria-hidden className="text-[color:var(--color-ink-dim)]">·</span>
                  <span>{job.location}</span>
                </>
              )}
              {job.search_keyword && (
                <>
                  <span aria-hidden className="text-[color:var(--color-ink-dim)]">·</span>
                  <span className="font-mono text-[11px] text-[color:var(--color-ink-dim)]">
                    {job.search_keyword}
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
            <ActionButton label="Interesado" isActive={job.status === 'interested'} onClick={() => setStatus('interested')} />
            <ActionButton label="Aplicado"   isActive={job.status === 'applied'}   onClick={() => setStatus('applied')} variant="amber" />
            <ActionButton label="Descartar"  isActive={job.status === 'dismissed'} onClick={() => setStatus('dismissed')} variant="dim" />
            <a
              href={job.url}
              target="_blank"
              rel="noopener noreferrer"
              className={[
                'inline-flex items-center gap-1 px-2.5 py-1 rounded-sm',
                'text-xs font-mono',
                'border border-[color:var(--color-border-bright)]',
                'text-[color:var(--color-ink)] hover:text-[color:var(--color-amber)]',
                'hover:border-[color:var(--color-amber-dim)] transition-colors ml-1',
              ].join(' ')}
            >
              abrir ↗
            </a>
          </div>
        </div>

        {/* AI action row */}
        <div className="flex items-center gap-2 flex-wrap" style={{ borderTop: '1px solid var(--color-border)', paddingTop: '0.75rem' }}>
          {!isAnalyzed ? (
            <button
              type="button"
              onClick={handleAnalyze}
              disabled={analyzing}
              className="px-2.5 py-1 rounded-sm text-xs font-mono border transition-colors"
              style={
                analyzing
                  ? { border: '1px solid var(--color-border)', color: 'var(--color-ink-dim)' }
                  : { border: '1px solid var(--color-border-bright)', color: 'var(--color-ink-muted)' }
              }
            >
              {analyzing ? 'analizando…' : '✦ analizar con IA'}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setShowPanel((v) => !v)}
              className="px-2.5 py-1 rounded-sm text-xs font-mono border transition-colors"
              style={{ border: '1px solid var(--color-border-bright)', color: 'var(--color-ink-muted)' }}
            >
              {showPanel ? 'ocultar análisis ↑' : 'ver análisis ↓'}
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowModal(true)}
            className="px-2.5 py-1 rounded-sm text-xs font-mono border transition-colors"
            style={{ border: '1px solid var(--color-border-bright)', color: 'var(--color-ink-muted)' }}
          >
            ✉ generar carta
          </button>

          {analyzeError && (
            <span className="font-mono text-[11px]" style={{ color: '#E07070' }}>
              ⚠ {analyzeError}
            </span>
          )}
        </div>

        {/* Analysis panel (collapsible) */}
        {isAnalyzed && showPanel && (
          <JobAnalysisPanel analysis={analysisData.analysis} match={analysisData.match} />
        )}
      </article>

      {/* Cover letter modal (portal-like: rendered outside article flow via sibling) */}
      {showModal && (
        <CoverLetterModal
          jobId={job.external_id}
          jobTitle={job.title}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
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
  const base = 'px-2.5 py-1 rounded-sm text-xs transition-colors border';

  let active: string;
  if (variant === 'amber') {
    active = 'bg-[color:var(--color-amber)] text-[color:var(--color-canvas)] border-[color:var(--color-amber)]';
  } else if (variant === 'dim') {
    active = 'bg-[color:var(--color-surface-2)] text-[color:var(--color-ink-dim)] border-[color:var(--color-border-bright)]';
  } else {
    active = 'bg-[color:var(--color-surface-2)] text-[color:var(--color-ink)] border-[color:var(--color-border-bright)]';
  }

  const inactive = 'text-[color:var(--color-ink-muted)] border-transparent hover:text-[color:var(--color-ink)] hover:border-[color:var(--color-border)]';

  return (
    <button type="button" onClick={onClick} className={`${base} ${isActive ? active : inactive}`}>
      {label}
    </button>
  );
}
