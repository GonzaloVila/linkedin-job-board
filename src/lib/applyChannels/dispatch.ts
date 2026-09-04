import { sendEmailApplication } from './email';
import type { ApplyChannel } from '../db';

export class ChannelNotAutomatable extends Error {}

export type DispatchableJob = {
  external_id: string;
  title: string;
  company: string;
  apply_channel: ApplyChannel | null;
  apply_target: string | null;
  draft_cover_letter: string | null;
};

/**
 * Actually performs a submission for a given channel. Shared by Tier A
 * (called right after drafting, unattended) and Tier B (called from the
 * Telegram webhook when the user taps "✅ Enviar") — the tiers differ only
 * in *when* this fires, not in what it does. Only 'email' has a real
 * automated implementation today; every other channel throws
 * ChannelNotAutomatable so callers can fall back to "open the link, finish
 * it yourself" until Greenhouse/Lever/LinkedIn get built out.
 */
export async function submitViaChannel(job: DispatchableJob): Promise<void> {
  if (job.apply_channel === 'email' && job.apply_target && job.draft_cover_letter) {
    await sendEmailApplication({
      external_id: job.external_id,
      title: job.title,
      company: job.company,
      apply_target: job.apply_target,
      draft_cover_letter: job.draft_cover_letter,
    });
    return;
  }

  throw new ChannelNotAutomatable(`no automated submission built yet for channel ${job.apply_channel ?? 'unknown'}`);
}

/** Tier A fires unattended right after drafting — only when we're confident nothing risky is involved. */
export function isTierAEligible(job: { apply_channel: ApplyChannel | null; apply_target: string | null }): boolean {
  return (
    job.apply_channel === 'email' &&
    !!job.apply_target &&
    process.env.TIER_A_EMAIL_ENABLED === 'true'
  );
}
