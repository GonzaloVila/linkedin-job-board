-- Run this ONCE in Neon's SQL Editor before deploying the dashboard.
-- It adds a `status` column to the existing jobs_seen table.
-- The bot won't break: it keeps inserting jobs without specifying status,
-- and they get 'new' by default.

ALTER TABLE jobs_seen
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'new';

-- Allowed values: 'new' | 'interested' | 'applied' | 'dismissed'
-- We enforce this via the application, not via a CHECK constraint,
-- so adding a new status later is just a code change.

CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs_seen (status);
