import { NextResponse } from 'next/server';
import { sql, casApplicationStatus } from '@/lib/db';
import type { ApplyChannel } from '@/lib/db';
import { answerCallbackQuery, editMessageOutcome } from '@/lib/telegram';
import { submitViaChannel, ChannelNotAutomatable } from '@/lib/applyChannels/dispatch';

export const maxDuration = 60;

type TelegramUpdate = {
  callback_query?: {
    id: string;
    data?: string;
    message?: { chat: { id: number }; message_id: number };
  };
};

export async function POST(request: Request) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'TELEGRAM_WEBHOOK_SECRET not configured' }, { status: 500 });
  }
  if (request.headers.get('x-telegram-bot-api-secret-token') !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const update = (await request.json().catch(() => null)) as TelegramUpdate | null;
  const cq = update?.callback_query;
  if (!cq?.data) {
    // Not a button tap (could be any other update type) — nothing to do,
    // but still 200 so Telegram doesn't retry delivery.
    return NextResponse.json({ ok: true });
  }

  // Ack immediately — Telegram expects a quick response or the tapped
  // button spins forever in the user's chat. The actual work below can
  // take longer (email send, LLM calls already happened at draft time).
  await answerCallbackQuery(cq.id);

  const [action, jobId] = cq.data.split(':');
  if (!jobId || (action !== 'send' && action !== 'dismiss')) {
    return NextResponse.json({ ok: true });
  }

  try {
    if (action === 'dismiss') {
      await handleDismiss(jobId);
    } else {
      await handleSend(jobId);
    }
  } catch (err) {
    // Never let a dispatch failure surface as a non-200 to Telegram — that
    // just triggers redelivery of the same callback, which the CAS guards
    // below already make safe to ignore, but there's no need to fight it.
    console.error('[telegram-webhook] failed to handle callback', jobId, action, err);
  }

  return NextResponse.json({ ok: true });
}

async function handleDismiss(jobId: string): Promise<void> {
  const claimed = await casApplicationStatus(jobId, 'awaiting_approval', 'declined');
  if (!claimed) return; // already decided (duplicate delivery / double-tap)

  const [job] = await sql`SELECT telegram_chat_id, telegram_message_id, title FROM jobs_seen WHERE external_id = ${jobId}`;
  if (job?.telegram_chat_id && job?.telegram_message_id) {
    await editMessageOutcome(job.telegram_chat_id as string, job.telegram_message_id as number, `❌ Descartado — ${job.title}`);
  }
}

async function handleSend(jobId: string): Promise<void> {
  const claimed = await casApplicationStatus(jobId, 'awaiting_approval', 'sending');
  if (!claimed) return; // already decided (duplicate delivery / double-tap)

  const [job] = await sql`
    SELECT title, company, url, apply_channel, apply_target, draft_cover_letter,
           telegram_chat_id, telegram_message_id
    FROM jobs_seen WHERE external_id = ${jobId}
  `;
  if (!job) return;

  const chatId = job.telegram_chat_id as string | null;
  const messageId = job.telegram_message_id as number | null;

  try {
    await submitViaChannel({
      external_id: jobId,
      title: job.title as string,
      company: job.company as string,
      apply_channel: job.apply_channel as ApplyChannel | null,
      apply_target: job.apply_target as string | null,
      draft_cover_letter: job.draft_cover_letter as string | null,
    });

    await sql`
      UPDATE jobs_seen SET application_status = 'sent', status = 'applied', submitted_at = NOW()
      WHERE external_id = ${jobId}
    `;
    if (chatId && messageId) {
      await editMessageOutcome(chatId, messageId, `✅ Enviado — ${job.title} @ ${job.company}`);
    }
  } catch (err) {
    if (err instanceof ChannelNotAutomatable) {
      // No automated submission exists yet for this channel (LinkedIn Easy
      // Apply, or an unverified Greenhouse/Lever board) — the only honest
      // fallback is to send the user to finish it themselves.
      const isLinkedIn = job.apply_channel === 'linkedin_easy_apply';
      await sql`
        UPDATE jobs_seen SET
          application_status = ${isLinkedIn ? 'queued_for_playwright' : 'failed'},
          submission_error = 'sin automatización todavía para este canal — completar manualmente'
        WHERE external_id = ${jobId}
      `;
      if (chatId && messageId) {
        await editMessageOutcome(
          chatId, messageId,
          `⚠ Todavía no puedo enviar esto solo (${job.apply_channel}) — completalo vos acá:\n${job.url}`,
        );
      }
      return;
    }

    const message = err instanceof Error ? err.message : String(err);
    await sql`
      UPDATE jobs_seen SET application_status = 'failed', submission_error = ${message}
      WHERE external_id = ${jobId}
    `;
    if (chatId && messageId) {
      await editMessageOutcome(chatId, messageId, `❌ Falló el envío de ${job.title} — ${message}`);
    }
  }
}
