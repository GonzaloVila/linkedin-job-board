-- Run this ONCE in Neon's SQL Editor after 001_add_status.sql.
-- Adds AI analysis cache columns to jobs_seen.
-- Safe to run multiple times (IF NOT EXISTS).

ALTER TABLE jobs_seen
  ADD COLUMN IF NOT EXISTS analysis_json   JSONB,
  ADD COLUMN IF NOT EXISTS match_score     INTEGER,
  ADD COLUMN IF NOT EXISTS match_reasoning TEXT,
  ADD COLUMN IF NOT EXISTS analyzed_at     TIMESTAMPTZ;
