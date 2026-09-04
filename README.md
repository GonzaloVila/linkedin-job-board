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
│  ├── Dashboard         filter · search       │
│  ├── Actions           update job status     │
│  ├── /api/process-new     ◄── webhook (bot)  │
│  │   AI analysis + draft + Tier A/B apply    │
│  └── /api/telegram-webhook ◄── Telegram      │
│      Tier B approve/decline callback         │
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
- **AI analysis** — per-job extraction (skills, stack, seniority, modality, red flags) and a 0–100 match score against your CV, both cached on first run (`POST` via the "Analyze" button or automatically through the webhook below). Uses the job's full description when available (scraped by linkedin-bot's enrichment pass), not just title/company.
- **Auto-apply** — `POST /api/process-new` (called by linkedin-bot after every scrape) analyzes new jobs, drafts a cover letter + likely screening-question answers, and dispatches by channel:
  - **Tier A (0 taps)** — currently: apply-by-email. If the job's description has a contact email, the system sends the application itself, unattended, no matter how low the match score is (the score is informational only, never a gate).
  - **Tier B (1 tap)** — everything else, including every LinkedIn job (its apply flow can't be told apart from Easy Apply without logging in, so it's always treated as the riskier case). The drafted application goes to Telegram with `✅ Enviar` / `❌ Descartar` buttons — tapping "Enviar" triggers the real submission via `/api/telegram-webhook`, not just a link. Greenhouse/Lever postings are detected but don't have automated submission built yet (needs manual endpoint verification against a real board first) — for those, "Enviar" opens the link for you to finish.
  - Optional — disabled if the relevant env vars aren't set (`TIER_A_EMAIL_ENABLED=false` and no Telegram config both leave the bot/dashboard working standalone, jobs just sit at `application_status = 'none'`).

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
│   ├── actions/
│   │   └── ai.ts          ← Server Actions: analyzeJob, generateCoverLetter
│   ├── api/
│   │   ├── process-new/
│   │   │   └── route.ts   ← webhook: analyzes + drafts + Tier A send / Tier B queue
│   │   └── telegram-webhook/
│   │       └── route.ts   ← Tier B callback: Enviar/Descartar button taps
│   ├── globals.css        ← Tailwind v4 + @theme variables
│   ├── icon.svg           ← favicon
│   └── login/
│       ├── page.tsx       ← login form (Server Component)
│       └── actions.ts     ← Server Action: validates password + sets cookie
├── components/
│   ├── JobCard.tsx        ← Client Component: status buttons + job display
│   ├── FilterTabs.tsx     ← status tab navigation with counts
│   ├── CountrySelect.tsx  ← Client Component: country dropdown
│   ├── SearchInput.tsx    ← Client Component: debounced text search
│   ├── JobAnalysisPanel.tsx ← renders cached AI analysis + match score
│   └── CoverLetterModal.tsx ← generates/edits AI cover letters
├── lib/
│   ├── db.ts               ← postgres-js client + Job types + casApplicationStatus
│   ├── ai.ts                ← Groq calls: runAnalysis, runMatch, runCoverLetter, runScreeningAnswers
│   ├── cv.ts                 ← reads CV_CONTENT env var
│   ├── resume.ts              ← reads the resume PDF (public/resume.pdf or RESUME_PDF_URL)
│   ├── telegram.ts             ← sendApprovalMessage / editMessageOutcome / answerCallbackQuery
│   └── applyChannels/
│       ├── dispatch.ts         ← submitViaChannel — shared by Tier A and Tier B
│       └── email.ts            ← Tier A: sends via Resend, attaches resume.pdf
└── middleware.ts          ← Edge: cookie check → redirect to /login (bypassed for /api/*)
migrations/
├── 001_add_status.sql               ← adds status column to jobs_seen
├── 002_add_ai_columns.sql           ← adds analysis_json, match_score, match_reasoning, analyzed_at
└── 003_add_application_columns.sql  ← adds apply_tier, application_status, drafts, Telegram ids
public/
└── resume.pdf              ← your real CV, attached to Tier A emails (you provide this file)
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
| `GROQ_API_KEY` | Free key from [console.groq.com](https://console.groq.com) — powers analysis/match/cover letters |
| `CV_CONTENT` | Your CV as plain text/markdown, used for match scoring and cover letters |
| `BOT_WEBHOOK_SECRET` | Optional — shared secret linkedin-bot sends in `x-webhook-secret` to call `/api/process-new` |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` | Optional — required together to enable Tier B approval messages |
| `TELEGRAM_WEBHOOK_SECRET` | Required if using Telegram — authenticates the button-tap callback (step 5 below) |
| `GMAIL_USER` / `GMAIL_APP_PASSWORD` | Required for Tier A email — sends via Gmail's real SMTP so the recruiter sees a genuinely authenticated `gonzalovila08@gmail.com` |
| `RESUME_PDF_URL` | Optional — overrides `public/resume.pdf` with a remote URL (e.g. Vercel Blob) |
| `TIER_A_EMAIL_ENABLED` | `true` to actually send Tier A emails — keep `false` until the resume PDF + Resend domain are ready |
| `DASHBOARD_URL` | Optional — linked from a Telegram message when it's too long to fit inline |

See [linkedin-bot's README](https://github.com/GonzaloVila/linkedin-bot#notifying-the-job-board) for the webhook wiring between both repos.

### 3. Apply the migrations

Run once in the Neon SQL Editor (or reuse `psql`):

```sql
ALTER TABLE jobs_seen ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'new';
```

Then run `migrations/003_add_application_columns.sql` (adds `apply_tier`, `application_status`, drafts, Telegram ids). `description`/`apply_channel`/`apply_target` are added by linkedin-bot's own migration (`npm run db:migrate` in that repo) — both repos share the same `jobs_seen` table.

### 4. Add your resume PDF

Auto-apply emails (Tier A) attach a real PDF resume — there's no way to fabricate one from `CV_CONTENT`. Put your CV at `public/resume.pdf`, or set `RESUME_PDF_URL` to skip committing it to the repo.

### 4b. Enable Gmail as the real sender

Tier A sends through Gmail's actual SMTP (not a third-party sending domain) so recipients see a genuinely authenticated `gonzalovila08@gmail.com`:

1. Enable 2-Step Verification on the Gmail account, if it isn't already.
2. Generate an App Password at [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords) (pick "Mail" / "Other" as the app name — copy the 16-character password, no spaces).
3. Set `GMAIL_USER` (the Gmail address) and `GMAIL_APP_PASSWORD` (the generated password, not your normal login password) on Vercel.
4. Only then flip `TIER_A_EMAIL_ENABLED=true` — leave it `false` until both this and the resume PDF are in place.

### 5. Configure the Telegram bot (Tier B)

1. **Create a bot** — message [@BotFather](https://t.me/BotFather), run `/newbot`, copy the token.
2. **Get your chat ID** — message [@userinfobot](https://t.me/userinfobot).
3. **Generate `TELEGRAM_WEBHOOK_SECRET`** — e.g. `openssl rand -hex 24`.
4. **Set env vars** on Vercel: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `TELEGRAM_WEBHOOK_SECRET`, and deploy.
5. **Register the webhook** — once, after deploying:
   ```bash
   curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
     -d "url=https://<your-deploy>.vercel.app/api/telegram-webhook" \
     -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>"
   ```

### 6. Run locally

```bash
npm run dev
# open http://localhost:3000
```

### 7. Deploy to Vercel

1. Push the repo to GitHub (private repo works fine).
2. Import at [vercel.com/new](https://vercel.com/new).
3. Add all the env vars above.
4. Deploy. Vercel detects Next.js automatically — no build config needed.

---

## Sister project

**[linkedin-bot](https://github.com/GonzaloVila/linkedin-bot)** — TypeScript scraper that populates the database this dashboard reads from. Runs on GitHub Actions, no server required.
