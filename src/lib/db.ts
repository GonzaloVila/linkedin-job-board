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
    prepare: false, // Neon's pooler doesn't like prepared statements
  });

if (process.env.NODE_ENV !== 'production') globalForDb.sql = sql;

export type JobStatus = 'new' | 'interested' | 'applied' | 'dismissed';

export type Job = {
  external_id: string;
  title: string;
  company: string;
  location: string | null;
  url: string;
  posted_at: Date | null;
  search_keyword: string | null;
  notified_at: Date;
  status: JobStatus;
};
