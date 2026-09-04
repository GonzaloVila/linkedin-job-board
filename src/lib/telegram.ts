import type { ApplyChannel, ScreeningAnswer } from './db';

const TELEGRAM_MESSAGE_LIMIT = 4096;

type ApprovalJob = {
  external_id: string;
  title: string;
  company: string;
  location: string | null;
  url: string;
  match_score: number | null;
  match_reasoning: string | null;
  apply_channel: ApplyChannel | null;
  draft_cover_letter: string | null;
  draft_answers_json: ScreeningAnswer[] | null;
};

const CHANNEL_LABEL: Record<ApplyChannel, string> = {
  email: 'Email',
  greenhouse_public_form: 'Greenhouse',
  lever_public_form: 'Lever',
  linkedin_easy_apply: 'LinkedIn',
  external_unknown: 'Sitio externo',
};

function buildApprovalText(job: ApprovalJob): string {
  const lines: string[] = [
    `🎯 ${job.match_score ?? '?'}% match — ${job.title}`,
    `${job.company}${job.location ? ` · ${job.location}` : ''}`,
    `Canal: ${CHANNEL_LABEL[job.apply_channel ?? 'external_unknown']}`,
    '',
  ];

  if (job.match_reasoning) {
    lines.push(job.match_reasoning, '');
  }

  if (job.draft_cover_letter) {
    lines.push('— Carta de presentación —', job.draft_cover_letter, '');
  }

  if (job.draft_answers_json?.length) {
    lines.push('— Respuestas de screening —');
    for (const qa of job.draft_answers_json) {
      lines.push(`Q: ${qa.question}`, `A: ${qa.answer}`, '');
    }
  }

  lines.push(job.url);

  let text = lines.join('\n');
  if (text.length > TELEGRAM_MESSAGE_LIMIT) {
    const dashboardUrl = process.env.DASHBOARD_URL;
    const suffix = `\n\n[...] texto completo en ${dashboardUrl ?? 'el dashboard'} (#${job.external_id})`;
    text = text.slice(0, TELEGRAM_MESSAGE_LIMIT - suffix.length) + suffix;
  }
  return text;
}

async function callTelegram(method: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN not configured');

  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });

  const json = (await res.json()) as { ok: boolean; description?: string; result?: Record<string, unknown> };
  if (!res.ok || !json.ok) {
    throw new Error(`telegram ${method} failed: ${json.description ?? res.status}`);
  }
  return json.result ?? {};
}

/**
 * Sends a Tier B approval message with inline-keyboard buttons. The
 * callback_data encodes the action + job id so the webhook route can
 * dispatch without a lookup table: "send:<external_id>" / "dismiss:<external_id>".
 * Returns the chat/message id to persist so the message can be edited once
 * a decision comes back.
 */
export async function sendApprovalMessage(job: ApprovalJob): Promise<{ chatId: string; messageId: number }> {
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!chatId) throw new Error('TELEGRAM_CHAT_ID not configured');

  const result = await callTelegram('sendMessage', {
    chat_id: chatId,
    text: buildApprovalText(job),
    disable_web_page_preview: false,
    reply_markup: {
      inline_keyboard: [
        [
          { text: '✅ Enviar', callback_data: `send:${job.external_id}` },
          { text: '❌ Descartar', callback_data: `dismiss:${job.external_id}` },
        ],
      ],
    },
  });

  return { chatId, messageId: result.message_id as number };
}

/** Replaces the message text and removes the keyboard once a decision has been acted on. */
export async function editMessageOutcome(chatId: string, messageId: number, outcomeText: string): Promise<void> {
  await callTelegram('editMessageReplyMarkup', {
    chat_id: chatId,
    message_id: messageId,
    reply_markup: { inline_keyboard: [] },
  }).catch(() => {}); // best-effort — don't fail the request over a UI cleanup step

  await callTelegram('editMessageText', {
    chat_id: chatId,
    message_id: messageId,
    text: outcomeText.slice(0, TELEGRAM_MESSAGE_LIMIT),
  });
}

/** Telegram requires acking a callback query quickly or the tapped button spins forever. */
export async function answerCallbackQuery(callbackQueryId: string, text?: string): Promise<void> {
  await callTelegram('answerCallbackQuery', {
    callback_query_id: callbackQueryId,
    ...(text ? { text, show_alert: false } : {}),
  }).catch(() => {}); // best-effort — a failed ack shouldn't abort the actual submission
}
