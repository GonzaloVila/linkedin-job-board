import postgres from 'postgres';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL env var is required');
}

// Reuse a single connection across server components / actions.
// Next.js in dev hot-reloads, so we cache on globalThis to avoid leaks.
const globalForDb = globalThis as unknown as { sql?: ReturnType<typeof postgres> };

export const sql =
  globalForDb.sql ??
  postgres(process.env.DATABASE_URL, {
    max: 5,
    idle_timeout: 30,
    connect_timeout: 10, // fail fast instead of hanging if the pooler is unreachable
    prepare: false, // Neon's pooler doesn't like prepared statements
  });

if (process.env.NODE_ENV !== 'production') globalForDb.sql = sql;

export type JobStatus = 'new' | 'interested' | 'applied' | 'dismissed';

export type ApplyChannel =
  | 'email'
  | 'greenhouse_public_form'
  | 'lever_public_form'
  | 'linkedin_easy_apply'
  | 'external_unknown';

export type ApplyTier = 'A' | 'B';

export type ApplicationStatus =
  | 'none'
  | 'drafting'
  | 'drafted'
  | 'sending'
  | 'sent'
  | 'failed'
  | 'queued_telegram'
  | 'awaiting_approval'
  | 'declined'
  | 'queued_for_playwright';

export type ScreeningAnswer = { question: string; answer: string };

export type JobAnalysis = {
  required_skills: string[];
  nice_to_have: string[];
  seniority: 'junior' | 'ssr' | 'senior' | 'lead' | 'unknown';
  stack: string[];
  modality: 'remote' | 'hybrid' | 'onsite' | 'unknown';
  location: string | null;
  language_required: 'es' | 'en' | 'both' | 'unknown';
  salary_mentioned: string | null;
  red_flags: string[];
};

/**
 * Atomic compare-and-swap on application_status. Returns false if the row
 * wasn't in the expected `from` state (already claimed by another attempt,
 * a duplicate Telegram callback delivery, or a double-tap) — callers must
 * treat that as "someone else already handled this", never retry blindly.
 */
export async function casApplicationStatus(
  externalId: string,
  from: ApplicationStatus,
  to: ApplicationStatus,
): Promise<boolean> {
  const rows = await sql`
    UPDATE jobs_seen SET application_status = ${to}
    WHERE external_id = ${externalId} AND application_status = ${from}
    RETURNING external_id
  `;
  return rows.length > 0;
}

export type Job = {
  external_id: string;
  title: string;
  company: string;
  location: string | null;
  url: string;
  posted_at: Date | null;
  search_keyword: string | null;
  language_group: 'es' | 'en' | null;
  source: 'linkedin' | 'remoteok' | 'getonboard' | null;
  notified_at: Date;
  status: JobStatus;
  // AI cache columns (null until analyzed)
  analysis_json: JobAnalysis | null;
  match_score: number | null;
  match_reasoning: string | null;
  analyzed_at: Date | null;
  // Enrichment (owned by linkedin-bot's migration)
  description: string | null;
  apply_channel: ApplyChannel | null;
  apply_target: string | null;
  // Application automation
  apply_tier: ApplyTier | null;
  application_status: ApplicationStatus;
  draft_cover_letter: string | null;
  draft_answers_json: ScreeningAnswer[] | null;
  telegram_chat_id: string | null;
  telegram_message_id: number | null;
  submission_error: string | null;
  submitted_at: Date | null;
};
