import { NextResponse } from 'next/server';
import { sql, casApplicationStatus } from '@/lib/db';
import type { JobAnalysis, ApplyChannel } from '@/lib/db';
import { runAnalysis, runMatch, runCoverLetter, runScreeningAnswers } from '@/lib/ai';
import { getCV } from '@/lib/cv';
import { sendApprovalMessage } from '@/lib/telegram';
import { submitViaChannel, isTierAEligible } from '@/lib/applyChannels/dispatch';
import { isInApplyScope } from '@/lib/applyScope';

export const maxDuration = 60;

// Groq's free-tier output-tokens-per-minute cap on this account is a hard
// 1000, checked against each call's *requested* max_tokens, not actual
// usage. A single job's 4 calls (analysis + match + cover letter +
// screening answers, tuned to ~950 requested tokens total in ai.ts)
// already uses almost the entire window, so more than one job per
// invocation reliably 429s partway through. Anything left over gets
// picked up on the next webhook call (every linkedin-bot run) — jobs are
// prioritized newest-first, so a backlog never blocks fresh postings.
const BATCH_SIZE = 1;

export async function POST(request: Request) {
  const secret = process.env.BOT_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'BOT_WEBHOOK_SECRET not configured' }, { status: 500 });
  }
  if (request.headers.get('x-webhook-secret') !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // status IN ('new','interested') excludes anything the user already
  // triaged by hand — migration 003 backfilled application_status='none'
  // onto the entire historical backlog, and a job already marked
  // 'applied'/'dismissed' through the dashboard's manual buttons must never
  // get auto-drafted or auto-sent by this pipeline.
  //
  // The location regex is a coarse pre-filter on the raw scraped text —
  // BATCH_SIZE is 1 (Groq rate-limit budget), so an obviously out-of-scope
  // posting (e.g. a "Worldwide Remote" search surfacing a Berlin listing)
  // must never consume that single slot. isInApplyScope() below re-checks
  // this precisely once the AI's extracted location/modality are known —
  // this SQL version exists only to avoid wasting the slot, not as the
  // final word (`location IS NULL` still gets a chance there).
  const pending = await sql<{ external_id: string }[]>`
    SELECT external_id FROM jobs_seen
    WHERE application_status = 'none' AND status IN ('new', 'interested')
      AND (
        location IS NULL
        OR location ~* '(argentina|chile|colombia|m[eé]xico|per[uú]|uruguay|paraguay|bolivia|ecuador|venezuela|costa\s*rica|panam[aá]|latam|latin\s*america|am[eé]rica\s*latina|south\s*america|am[eé]rica\s*del\s*sur|spain|espa[ñn]a)'
      )
    ORDER BY notified_at DESC
    LIMIT ${BATCH_SIZE}
  `;

  try {
    const result = await processBatch(pending.map((r) => r.external_id));
    return NextResponse.json({ picked: pending.length, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[process-new] batch setup failed', err);
    return NextResponse.json({ picked: pending.length, error: message }, { status: 500 });
  }
}

type BatchResult = {
  autoSent: number;
  queuedTelegram: number;
  skipped: number;
  failed: { jobId: string; error: string }[];
};

async function processBatch(jobIds: string[]): Promise<BatchResult> {
  const result: BatchResult = { autoSent: 0, queuedTelegram: 0, skipped: 0, failed: [] };
  if (jobIds.length === 0) return result;

  const cv = getCV();

  for (const jobId of jobIds) {
    // Claim the row up front — if another invocation already grabbed it
    // (overlapping webhook calls), this is a no-op skip, not a retry.
    const claimed = await casApplicationStatus(jobId, 'none', 'drafting');
    if (!claimed) continue;

    try {
      await draftAndDispatch(jobId, cv, result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[process-new] failed for job', jobId, err);
      await sql`
        UPDATE jobs_seen SET application_status = 'failed', submission_error = ${message}
        WHERE external_id = ${jobId}
      `;
      result.failed.push({ jobId, error: message });
    }
  }

  return result;
}

async function draftAndDispatch(jobId: string, cv: string, result: BatchResult): Promise<void> {
  const [job] = await sql`
    SELECT title, company, location, url, search_keyword, description,
           apply_channel, apply_target, analysis_json, match_score, match_reasoning, analyzed_at
    FROM jobs_seen WHERE external_id = ${jobId}
  `;
  if (!job) return;

  let analysis: JobAnalysis;
  let match: { score: number; reasoning: string };

  if (job.analyzed_at && job.analysis_json) {
    analysis = job.analysis_json as JobAnalysis;
    match = { score: job.match_score as number, reasoning: job.match_reasoning as string };
  } else {
    analysis = await runAnalysis({
      title: job.title as string,
      company: job.company as string,
      location: job.location as string | null,
      search_keyword: job.search_keyword as string | null,
      description: job.description as string | null,
    });
    match = await runMatch(analysis, cv);
    await sql`
      UPDATE jobs_seen SET
        analysis_json   = ${JSON.stringify(analysis)}::jsonb,
        match_score     = ${match.score},
        match_reasoning = ${match.reasoning},
        analyzed_at     = NOW()
      WHERE external_id = ${jobId}
    `;
  }

  // Geographic scope gate: Argentina (any modality), other LatAm only if
  // remote, Spain only if remote — per explicit user preference. Runs after
  // analysis (uses the AI's extracted location/modality, more reliable than
  // the raw scraped string alone) but before spending the other 2 LLM calls
  // on a cover letter/screening answers nobody should receive.
  if (!isInApplyScope(job.location as string | null, analysis.location, analysis.modality)) {
    await sql`UPDATE jobs_seen SET application_status = 'skipped' WHERE external_id = ${jobId}`;
    result.skipped++;
    return;
  }

  // Match score is informational only here — shown in the dashboard and the
  // Telegram message, but it never blocks drafting or sending. The junior
  // filter in linkedin-bot already screens out grossly irrelevant roles.
  const jobForDrafting = {
    title: job.title as string,
    company: job.company as string,
    location: job.location as string | null,
    description: job.description as string | null,
  };

  const [coverLetter, answers] = await Promise.all([
    runCoverLetter(jobForDrafting, analysis, cv),
    runScreeningAnswers(jobForDrafting, analysis, cv),
  ]);

  const applyChannel = job.apply_channel as ApplyChannel | null;
  const applyTarget = job.apply_target as string | null;
  const tierA = isTierAEligible({ apply_channel: applyChannel, apply_target: applyTarget });

  await sql`
    UPDATE jobs_seen SET
      draft_cover_letter = ${coverLetter},
      draft_answers_json = ${JSON.stringify(answers)}::jsonb,
      apply_tier          = ${tierA ? 'A' : 'B'},
      application_status  = 'drafted'
    WHERE external_id = ${jobId}
  `;

  const dispatchableJob = {
    external_id: jobId,
    title: job.title as string,
    company: job.company as string,
    apply_channel: applyChannel,
    apply_target: applyTarget,
    draft_cover_letter: coverLetter,
  };

  if (tierA) {
    const claimedSend = await casApplicationStatus(jobId, 'drafted', 'sending');
    if (!claimedSend) return;

    try {
      await submitViaChannel(dispatchableJob);
      await sql`
        UPDATE jobs_seen SET application_status = 'sent', status = 'applied', submitted_at = NOW()
        WHERE external_id = ${jobId}
      `;
      result.autoSent++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await sql`
        UPDATE jobs_seen SET application_status = 'failed', submission_error = ${message}
        WHERE external_id = ${jobId}
      `;
      throw err;
    }
    return;
  }

  // Tier B: queue the Telegram approval.
  const claimedQueue = await casApplicationStatus(jobId, 'drafted', 'queued_telegram');
  if (!claimedQueue) return;

  const { chatId, messageId } = await sendApprovalMessage({
    external_id: jobId,
    title: job.title as string,
    company: job.company as string,
    location: job.location as string | null,
    url: job.url as string,
    match_score: match.score,
    match_reasoning: match.reasoning,
    apply_channel: applyChannel,
    draft_cover_letter: coverLetter,
    draft_answers_json: answers,
  });

  await sql`
    UPDATE jobs_seen SET
      application_status  = 'awaiting_approval',
      telegram_chat_id    = ${chatId},
      telegram_message_id = ${messageId}
    WHERE external_id = ${jobId}
  `;
  result.queuedTelegram++;
}
