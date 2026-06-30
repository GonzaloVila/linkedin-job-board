type JobAlert = {
  title: string;
  company: string;
  location: string | null;
  url: string;
  score: number;
  reasoning: string;
};

export async function sendMatchAlert(job: JobAlert): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;

  const lines = [
    `🎯 *${job.score}* match — ${escapeMd(job.title)}`,
    escapeMd(job.company) + (job.location ? ` · ${escapeMd(job.location)}` : ''),
    '',
    escapeMd(job.reasoning),
    '',
    job.url,
  ];

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: lines.join('\n'),
      parse_mode: 'MarkdownV2',
      disable_web_page_preview: false,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error('[telegram] sendMessage failed', res.status, body);
  }
}

// MarkdownV2 requires escaping these reserved characters in plain text segments.
function escapeMd(text: string): string {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
}
