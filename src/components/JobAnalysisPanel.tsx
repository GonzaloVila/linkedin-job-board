import type { JobAnalysis } from '@/lib/db';

const MODALITY_LABEL: Record<string, string> = {
  remote: 'Remoto',
  hybrid: 'Híbrido',
  onsite: 'Presencial',
  unknown: '—',
};

const SENIORITY_LABEL: Record<string, string> = {
  junior: 'Junior',
  ssr: 'Semi-Senior',
  senior: 'Senior',
  lead: 'Lead',
  unknown: '—',
};

const LANG_LABEL: Record<string, string> = {
  es: 'Español',
  en: 'Inglés',
  both: 'Español + Inglés',
  unknown: '—',
};

function scoreColor(score: number): string {
  if (score >= 70) return '#C9D9A3'; // --color-interested (green)
  if (score >= 40) return '#E8B17C'; // --color-amber
  return '#E07070';                  // warm red — not in theme but fits the palette
}

function Pill({ label }: { label: string }) {
  return (
    <span
      className="inline-block px-2 py-0.5 rounded-sm font-mono text-[10px] tracking-wider"
      style={{
        background: 'var(--color-surface-2)',
        border: '1px solid var(--color-border-bright)',
        color: 'var(--color-ink-muted)',
      }}
    >
      {label}
    </span>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-mono text-[10px] tracking-widest" style={{ color: 'var(--color-ink-dim)' }}>
        {title}
      </span>
      {children}
    </div>
  );
}

type Props = {
  analysis: JobAnalysis;
  match: { score: number; reasoning: string };
};

export function JobAnalysisPanel({ analysis, match }: Props) {
  const color = scoreColor(match.score);

  return (
    <div
      className="mt-3 pt-4 flex flex-col gap-5"
      style={{ borderTop: '1px solid var(--color-border)' }}
    >
      {/* Match score + reasoning */}
      <div className="flex items-start gap-4 flex-wrap">
        <div className="flex flex-col items-center shrink-0">
          <span className="font-mono text-3xl font-light tabular-nums" style={{ color }}>
            {match.score}
          </span>
          <span className="font-mono text-[9px] tracking-widest" style={{ color: 'var(--color-ink-dim)' }}>
            MATCH
          </span>
        </div>
        <p className="text-sm leading-relaxed flex-1" style={{ color: 'var(--color-ink-muted)' }}>
          {match.reasoning}
        </p>
      </div>

      {/* Grid of analysis fields */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <Section title="SENIORITY">
          <span className="text-sm" style={{ color: 'var(--color-ink)' }}>
            {SENIORITY_LABEL[analysis.seniority] ?? analysis.seniority}
          </span>
        </Section>

        <Section title="MODALIDAD">
          <span className="text-sm" style={{ color: 'var(--color-ink)' }}>
            {MODALITY_LABEL[analysis.modality] ?? analysis.modality}
          </span>
        </Section>

        <Section title="IDIOMA">
          <span className="text-sm" style={{ color: 'var(--color-ink)' }}>
            {LANG_LABEL[analysis.language_required] ?? analysis.language_required}
          </span>
        </Section>

        {analysis.salary_mentioned && (
          <Section title="SALARIO">
            <span className="text-sm" style={{ color: 'var(--color-amber)' }}>
              {analysis.salary_mentioned}
            </span>
          </Section>
        )}
      </div>

      {analysis.required_skills.length > 0 && (
        <Section title="SKILLS REQUERIDAS">
          <div className="flex flex-wrap gap-1.5">
            {analysis.required_skills.map((s) => <Pill key={s} label={s} />)}
          </div>
        </Section>
      )}

      {analysis.stack.length > 0 && (
        <Section title="STACK">
          <div className="flex flex-wrap gap-1.5">
            {analysis.stack.map((s) => <Pill key={s} label={s} />)}
          </div>
        </Section>
      )}

      {analysis.nice_to_have.length > 0 && (
        <Section title="NICE TO HAVE">
          <div className="flex flex-wrap gap-1.5">
            {analysis.nice_to_have.map((s) => <Pill key={s} label={s} />)}
          </div>
        </Section>
      )}

      {analysis.red_flags.length > 0 && (
        <Section title="RED FLAGS">
          <div className="flex flex-col gap-1">
            {analysis.red_flags.map((f) => (
              <span key={f} className="font-mono text-[11px]" style={{ color: '#E07070' }}>
                ⚠ {f}
              </span>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}
