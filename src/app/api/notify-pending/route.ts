import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import type { JobAnalysis } from '@/lib/db';
import { runAnalysis, runMatch } from '@/lib/ai';
import { getCV } from '@/lib/cv';
import { sendMatchAlert } from '@/lib/telegram';

export const maxDuration = 60;

// Bounded so a single invocation fits inside maxDuration. Anything left
// over gets picked up on the next webhook call (every job_board hourly run).
const BATCH_SIZE = 10;
const ALERT_THRESHOLD = Number(process.env.MATCH_ALERT_THRESHOLD ?? 75);

export async function POST(request: Request) {
  const secret = process.env.BOT_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'BOT_WEBHOOK_SECRET not configured' }, { status: 500 });
  }
  if (request.headers.get('x-webhook-secret') !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // Newest first: there's a large backlog of historically-unanalyzed jobs,
  // and the point of this endpoint is alerting on jobs the bot just found —
  // not slowly working through old ones (those stay analyzable on-demand
  // from the dashboard's "Analyze" button).
  const pending = await sql<{ external_id: string }[]>`
    SELECT external_id FROM jobs_seen
    WHERE analyzed_at IS NULL
    ORDER BY notified_at DESC
    LIMIT ${BATCH_SIZE}
  `;

  // Processed synchronously (not via after()/waitUntil) so the response
  // reflects what actually happened — easy to test with a single curl and
  // doesn't depend on the platform sustaining background work post-response.
  try {
    const result = await processBatch(pending.map((r) => r.external_id));
    return NextResponse.json({ queued: pending.length, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[notify-pending] batch setup failed', err);
    return NextResponse.json({ queued: pending.length, error: message }, { status: 500 });
  }
}

async function processBatch(
  jobIds: string[]
): Promise<{ analyzed: number; alerted: number; failed: { jobId: string; error: string }[] }> {
  const result = { analyzed: 0, alerted: 0, failed: [] as { jobId: string; error: string }[] };
  if (jobIds.length === 0) return result;

  const cv = getCV();

  for (const jobId of jobIds) {
    try {
      const [job] = await sql`
        SELECT title, company, location, url, search_keyword
        FROM jobs_seen WHERE external_id = ${jobId}
      `;
      if (!job) continue;

      const analysis: JobAnalysis = await runAnalysis({
        title: job.title as string,
        company: job.company as string,
        location: job.location as string | null,
        search_keyword: job.search_keyword as string | null,
      });
      const match = await runMatch(analysis, cv);

      await sql`
        UPDATE jobs_seen SET
          analysis_json   = ${JSON.stringify(analysis)}::jsonb,
          match_score     = ${match.score},
          match_reasoning = ${match.reasoning},
          analyzed_at     = NOW()
        WHERE external_id = ${jobId}
      `;
      result.analyzed++;

      if (match.score >= ALERT_THRESHOLD) {
        await sendMatchAlert({
          title: job.title as string,
          company: job.company as string,
          location: job.location as string | null,
          url: job.url as string,
          score: match.score,
          reasoning: match.reasoning,
        });
        result.alerted++;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[notify-pending] failed for job', jobId, err);
      result.failed.push({ jobId, error: message });
    }
  }

  return result;
}
