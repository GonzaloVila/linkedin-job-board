'use client';

import { useState, useTransition, useRef, useEffect } from 'react';
import { generateCoverLetter } from '@/app/actions/ai';

type Tone = 'formal' | 'cercano';

type Props = {
  jobId: string;
  jobTitle: string;
  onClose: () => void;
};

export function CoverLetterModal({ jobId, jobTitle, onClose }: Props) {
  const [tone, setTone] = useState<Tone>('cercano');
  const [feedback, setFeedback] = useState('');
  const [letter, setLetter] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const overlayRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  // Generate on first open
  useEffect(() => {
    handleGenerate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleGenerate() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await generateCoverLetter(jobId, {
          tone,
          feedback: feedback.trim() || undefined,
        });
        setLetter(result);
        setFeedback('');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Error generando la carta.');
      }
    });
  }

  function handleOverlayClick(e: React.MouseEvent) {
    if (e.target === overlayRef.current) onClose();
  }

  async function handleCopy() {
    if (!letter) return;
    await navigator.clipboard.writeText(letter);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(15,14,12,0.85)', backdropFilter: 'blur(2px)' }}
    >
      <div
        className="flex flex-col w-full max-w-2xl max-h-[90vh] rounded-sm"
        style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border-bright)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 shrink-0"
          style={{ borderBottom: '1px solid var(--color-border)' }}
        >
          <div>
            <span
              className="font-mono text-[10px] tracking-widest"
              style={{ color: 'var(--color-ink-dim)' }}
            >
              CARTA DE PRESENTACIÓN
            </span>
            <p
              className="text-sm mt-0.5 truncate"
              style={{ color: 'var(--color-ink-muted)' }}
            >
              {jobTitle}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="font-mono text-lg leading-none px-1 transition-colors"
            style={{ color: 'var(--color-ink-dim)' }}
            aria-label="Cerrar"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 min-h-0">
          {isPending && (
            <div className="flex items-center gap-2 py-8 justify-center">
              <span
                className="font-mono text-sm animate-pulse"
                style={{ color: 'var(--color-ink-dim)' }}
              >
                generando carta…
              </span>
            </div>
          )}

          {!isPending && error && (
            <p className="font-mono text-sm py-4" style={{ color: '#E07070' }}>
              ⚠ {error}
            </p>
          )}

          {!isPending && letter && (
            <pre
              className="text-sm leading-relaxed whitespace-pre-wrap font-sans"
              style={{ color: 'var(--color-ink)' }}
            >
              {letter}
            </pre>
          )}
        </div>

        {/* Footer controls */}
        <div
          className="shrink-0 px-5 py-4 flex flex-col gap-3"
          style={{ borderTop: '1px solid var(--color-border)' }}
        >
          {/* Tone selector */}
          <div className="flex items-center gap-2">
            <span
              className="font-mono text-[10px] tracking-widest shrink-0"
              style={{ color: 'var(--color-ink-dim)' }}
            >
              TONO
            </span>
            {(['cercano', 'formal'] as Tone[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTone(t)}
                className="px-2.5 py-1 rounded-sm text-xs font-mono border transition-colors"
                style={
                  tone === t
                    ? {
                        background: 'var(--color-surface-2)',
                        border: '1px solid var(--color-border-bright)',
                        color: 'var(--color-ink)',
                      }
                    : {
                        border: '1px solid transparent',
                        color: 'var(--color-ink-dim)',
                      }
                }
              >
                {t}
              </button>
            ))}
          </div>

          {/* Feedback input */}
          <textarea
            rows={2}
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="Feedback para regenerar (opcional): ej. hacela más corta, enfatizá React…"
            className="w-full rounded-sm px-3 py-2 text-sm font-mono resize-none transition-colors"
            style={{
              background: 'var(--color-canvas)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-ink)',
              outline: 'none',
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--color-border-bright)')}
            onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--color-border)')}
          />

          {/* Action buttons */}
          <div className="flex items-center gap-2 justify-end">
            {letter && (
              <button
                type="button"
                onClick={handleCopy}
                disabled={isPending}
                className="px-3 py-1.5 rounded-sm text-xs font-mono border transition-colors"
                style={{
                  border: '1px solid var(--color-border-bright)',
                  color: copied ? 'var(--color-interested)' : 'var(--color-ink-muted)',
                }}
              >
                {copied ? 'copiado ✓' : 'copiar'}
              </button>
            )}
            <button
              type="button"
              onClick={handleGenerate}
              disabled={isPending}
              className="px-3 py-1.5 rounded-sm text-xs font-mono border transition-colors"
              style={
                isPending
                  ? { border: '1px solid var(--color-border)', color: 'var(--color-ink-dim)' }
                  : {
                      background: 'var(--color-amber)',
                      border: '1px solid var(--color-amber)',
                      color: 'var(--color-canvas)',
                    }
              }
            >
              {isPending ? 'generando…' : letter ? 're-generar' : 'generar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
