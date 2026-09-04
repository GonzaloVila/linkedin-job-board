import nodemailer from 'nodemailer';
import { getResumeAttachment } from '../resume';

export type EmailApplicationJob = {
  external_id: string;
  title: string;
  company: string;
  apply_target: string; // email address
  draft_cover_letter: string;
};

let transporter: ReturnType<typeof nodemailer.createTransport> | null = null;

function getTransporter() {
  if (transporter) return transporter;

  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) throw new Error('GMAIL_USER/GMAIL_APP_PASSWORD not configured');

  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  });
  return transporter;
}

/**
 * Sends the actual application email through the real Gmail account (SMTP +
 * an App Password) — the recipient sees a genuinely authenticated
 * "From: gonzalovila08@gmail.com", not a third-party sending domain, and
 * replies land straight in that inbox. The only channel that runs
 * completely unattended (Tier A) since it doesn't involve automating a
 * login-gated session on a platform whose ToS forbids it. Shared by both
 * tiers: Tier A calls this right after drafting, Tier B calls it from the
 * webhook when the user taps "✅ Enviar" on a job whose channel happens to
 * be 'email'.
 */
export async function sendEmailApplication(job: EmailApplicationJob): Promise<void> {
  const resume = await getResumeAttachment();

  await getTransporter().sendMail({
    from: process.env.GMAIL_USER,
    to: job.apply_target,
    subject: `Postulación — ${job.title} en ${job.company}`,
    text: job.draft_cover_letter,
    attachments: [{ filename: resume.filename, content: resume.content }],
  });
}
