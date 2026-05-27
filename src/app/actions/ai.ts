'use server';

import { revalidatePath } from 'next/cache';
import { sql } from '@/lib/db';
import type { JobAnalysis } from '@/lib/db';
import { runAnalysis, runMatch, runCoverLetter } from '@/lib/ai';
import { getCV } from '@/lib/cv';

export async function analyzeJob(jobId: string): Promise<{
  analysis: JobAnalysis;
  match: { score: number; reasoning: string };
}> {
  if (!jobId || typeof jobId !== 'string') throw new Error('jobId required');

  // Return cached result if available
  const [row] = await sql`
    SELECT analysis_json, match_score, match_reasoning, analyzed_at
    FROM jobs_seen WHERE external_id = ${jobId}
  `;
  if (!row) throw new Error(`Job ${jobId} not found`);

  if (row.analyzed_at && row.analysis_json) {
    return {
      analysis: row.analysis_json as JobAnalysis,
      match: { score: row.match_score as number, reasoning: row.match_reasoning as string },
    };
  }

  // Fetch job fields needed for analysis
  const [job] = await sql`
    SELECT title, company, location, search_keyword FROM jobs_seen WHERE external_id = ${jobId}
  `;

  const cv = getCV();

  let analysis: JobAnalysis;
  let match: { score: number; reasoning: string };
  try {
    analysis = await runAnalysis({
      title: job.title as string,
      company: job.company as string,
      location: job.location as string | null,
      search_keyword: job.search_keyword as string | null,
    });
    match = await runMatch(analysis, cv);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : JSON.stringify(e);
    console.error('[analyzeJob] Cerebras error:', e);
    throw new Error(`Error al llamar a la IA: ${msg}`);
  }

  await sql`
    UPDATE jobs_seen SET
      analysis_json   = ${JSON.stringify(analysis)}::jsonb,
      match_score     = ${match.score},
      match_reasoning = ${match.reasoning},
      analyzed_at     = NOW()
    WHERE external_id = ${jobId}
  `;

  revalidatePath('/');

  return { analysis, match };
}

export async function generateCoverLetter(
  jobId: string,
  opts?: { tone?: 'formal' | 'cercano'; feedback?: string },
): Promise<string> {
  if (!jobId || typeof jobId !== 'string') throw new Error('jobId required');

  const [job] = await sql`
    SELECT title, company, location, analysis_json FROM jobs_seen WHERE external_id = ${jobId}
  `;
  if (!job) throw new Error(`Job ${jobId} not found`);

  const cv = getCV();

  // Use cached analysis if available; otherwise run a quick analysis for the prompt
  let analysis: JobAnalysis;
  if (job.analysis_json) {
    analysis = job.analysis_json as JobAnalysis;
  } else {
    analysis = await runAnalysis({
      title: job.title as string,
      company: job.company as string,
      location: job.location as string | null,
      search_keyword: null,
    });
  }

  return runCoverLetter(
    { title: job.title as string, company: job.company as string, location: job.location as string | null },
    analysis,
    cv,
    opts,
  );
}
