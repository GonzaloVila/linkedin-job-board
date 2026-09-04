-- Run once in the Neon SQL Editor.
-- Adds application-automation tracking on top of jobs_seen (owned by
-- linkedin-bot's migration for description/apply_channel/apply_target).

ALTER TABLE jobs_seen
  ADD COLUMN IF NOT EXISTS apply_tier          TEXT,
  ADD COLUMN IF NOT EXISTS application_status  TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS draft_cover_letter  TEXT,
  ADD COLUMN IF NOT EXISTS draft_answers_json  JSONB,
  ADD COLUMN IF NOT EXISTS telegram_chat_id    TEXT,
  ADD COLUMN IF NOT EXISTS telegram_message_id BIGINT,
  ADD COLUMN IF NOT EXISTS submission_error    TEXT,
  ADD COLUMN IF NOT EXISTS submitted_at        TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_jobs_application_status ON jobs_seen (application_status);
