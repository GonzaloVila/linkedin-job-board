# linkedin-job-board

Personal Next.js dashboard to browse, filter, and triage the job listings collected by **[linkedin-bot](https://github.com/GonzaloVila/linkedin-bot)**. Connects to the same Neon database the bot writes to — new jobs appear automatically, no sync needed.

---

## System Overview

```
┌──────────────────────────────────────────────┐
│         GitHub Actions  (hourly cron)         │
│                                              │
│  linkedin-bot                                │
│  ├── Scraper    LinkedIn public job feed     │
│  ├── Filter     junior signal detection      │
│  └── Writer     deduplicates + persists      │
└────────────────────┬─────────────────────────┘
                     │  INSERT new jobs
                     ▼
          ┌──────────────────────┐
          │   Neon  PostgreSQL   │
          │   jobs_seen table    │
          └──────────┬───────────┘
                     │  SELECT + UPDATE status
                     ▼
┌──────────────────────────────────────────────┐
│              Vercel  (Next.js 15)             │
│                                              │
│  linkedin-job-board                          │
│  ├── Dashboard  filter · search · paginate   │
│  └── Actions    update job status            │
└──────────────────────────────────────────────┘
```

---

## Features

- **Status tabs** — filter by Pending (new + interested), Interested, Applied, Dismissed, or All. Counts update per tab.
- **Country filter** — dropdown built from the actual locations in the database, extracted from LinkedIn's location strings.
- **Full-text search** — debounced, synced to the URL. Searches title and company via `ILIKE` at the database level.
- **Pagination** — 20 results per page, all filters and pagination state live in URL params (shareable, navigable with browser back/forward).
- **Status actions** — three buttons per job card (Interested / Applied / Dismiss) backed by Next.js Server Actions. Status persists instantly across refreshes.
- **Cookie auth** — single-password login form, `httpOnly` cookie valid for 30 days. No auth provider needed for a personal tool.

---

## Design

The aesthetic is intentionally **"editorial terminal"**: warm dark background (`#0F0E0C`), Fraunces serif italic for the wordmark, Geist Mono for metadata, a single amber accent (`#E8B17C`), and a subtle grain overlay. Built to not look like a generic AI demo UI.

All theme variables live in `src/app/globals.css` under `@theme` (Tailwind v4 — no `tailwind.config.ts`).

---

## Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 15 App Router | Server Components fetch DB directly — no API routes needed |
| React | React 19 | Server Actions for status updates — no REST endpoints |
| Styling | Tailwind CSS v4 | `@theme` in CSS, zero config file |
| Database | `postgres` (postgres-js) | Same driver as the bot; `prepare: false` for Neon's pooler |
| Auth | Custom cookie middleware | Single password, no session management, Edge-compatible |
| Fonts | Fraunces + Geist (via `geist` npm) | |
| Hosting | Vercel free tier | |

---

## Architecture Notes

**All filtering happens in SQL**, not JavaScript. Status, country, and text search are pushed down to Postgres as parameterized `WHERE` clauses. The counts query and the countries dropdown query run in parallel with the main jobs query via `Promise.all`.

**No REST API**. The dashboard is entirely Server Components + Server Actions. The only client components are `SearchInput` (debounce + URL sync), `CountrySelect` (onChange → router.replace), and `JobCard` (status button state).

**Country extraction** uses PostgreSQL's `TRIM(SPLIT_PART(location, ',', -1))` to pull the last segment from LinkedIn's location strings (e.g. `"Buenos Aires, Provincia de Buenos Aires, Argentina"` → `"Argentina"`).

---

## Project Structure

```
src/
├── app/
│   ├── layout.tsx         ← fonts + root HTML
│   ├── page.tsx           ← dashboard (Server Component, parallel DB queries)
│   ├── actions.ts         ← Server Action: updateJobStatus
│   ├── globals.css        ← Tailwind v4 + @theme variables
│   ├── icon.svg           ← favicon
│   └── login/
│       ├── page.tsx       ← login form (Server Component)
│       └── actions.ts     ← Server Action: validates password + sets cookie
├── components/
│   ├── JobCard.tsx        ← Client Component: status buttons + job display
│   ├── FilterTabs.tsx     ← status tab navigation with counts
│   ├── CountrySelect.tsx  ← Client Component: country dropdown
│   └── SearchInput.tsx    ← Client Component: debounced text search
├── lib/
│   └── db.ts             ← postgres-js client + Job type
└── middleware.ts          ← Edge: cookie check → redirect to /login
migrations/
└── 001_add_status.sql     ← adds status column to jobs_seen
```

---

## Setup

### Prerequisites
- Node.js ≥ 20
- The `jobs_seen` table already created by [linkedin-bot](https://github.com/GonzaloVila/linkedin-bot)
- The migration in `migrations/001_add_status.sql` applied to that database

### 1. Clone and install

```bash
git clone https://github.com/GonzaloVila/linkedin-job-board.git
cd linkedin-job-board
npm install
```

### 2. Environment variables

```bash
cp .env.example .env.local
```

| Variable | Description |
|---|---|
| `DATABASE_URL` | Same Neon connection string used by the bot |
| `DASHBOARD_PASSWORD` | Any password — avoid `#` and `$` (Chromium Basic Auth quirk) |

### 3. Apply the migration

Run this once in the Neon SQL Editor:

```sql
ALTER TABLE jobs_seen
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'new';
```

### 4. Run locally

```bash
npm run dev
# open http://localhost:3000
```

### 5. Deploy to Vercel

1. Push the repo to GitHub (private repo works fine).
2. Import at [vercel.com/new](https://vercel.com/new).
3. Add `DATABASE_URL` and `DASHBOARD_PASSWORD` as environment variables.
4. Deploy. Vercel detects Next.js automatically — no build config needed.

---

## Sister project

**[linkedin-bot](https://github.com/GonzaloVila/linkedin-bot)** — TypeScript scraper that populates the database this dashboard reads from. Runs on GitHub Actions, no server required.
