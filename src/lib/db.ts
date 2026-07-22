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
};
