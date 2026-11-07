# career-agent

A personal job-search agent you run for free on GitHub Actions + Cloudflare Workers. Every morning it scans job boards, scores each posting against **your** CV with an LLM, drafts a tailored CV, cover letter and email for the good ones, and sends a summary to your Telegram. A Telegram bot and a private web dashboard let you ask "best remote jobs this week?", get PDFs, and send an application by email after you confirm.

It never submits an application or sends an email without your explicit `/ya` (yes). No auto-apply — that breaks job-board terms and sends wrong applications.

Works for any profession: DevOps, security, data, backend, finance, marketing… you only edit three files.

> Panduan lengkap dalam Bahasa Indonesia: [docs/PANDUAN.md](docs/PANDUAN.md)

## How it works

```
sources.yaml ──scan──▶ data/jobs.jsonl ──score (OpenAI)──▶ fit 1–5, remote/onsite, in-scope?
                                             │
                                             ├─ fit ≥ 4 ──draft (OpenAI)──▶ applications/<company>--<title>--<id>/
                                             │                              cv.md · cover-letter.md · email.md · job.md
                                             └──────── notify ──▶ Telegram summary (remote first, then score, then newest)

Telegram bot (Cloudflare Worker, webhook):  /top  /baru  /remote  /cari <word>  /pdf <id>  /kirim <id> <email>  + free-text questions
Dashboard:  https://<your-worker>.workers.dev/?k=<DASH_KEY>
```

Supported sources (verified public endpoints): Jobstreet, Kalibrr, Greenhouse, Lever, Ashby, SmartRecruiters, Workable, Workday, Manatal, custom scrapers, and LinkedIn job-alert emails read from Gmail (IMAP).

## Quick start

1. **Use this template** → create a **private** repo named `career` (keep it private: it will contain your CV and drafts).
2. Edit three files:
   - `profile/cv.md` — your CV in Markdown (the drafter may only use facts written here).
   - `profile/preferences.yaml` — target titles, seniority, location rule, remote priority, salary floor.
   - `sources.yaml` — search keywords per board and company boards you care about.
3. Add repository secrets (Settings → Secrets and variables → Actions):

   | Secret | Where to get it |
   | --- | --- |
   | `OPENAI_API_KEY` | platform.openai.com → API keys (add ≥ US$5 credit) |
   | `TELEGRAM_BOT_TOKEN` | Telegram → @BotFather → `/newbot` |
   | `TELEGRAM_CHAT_ID` | Telegram → @userinfobot → Start (your numeric id); also press Start on your own bot |
   | `GMAIL_USER`, `GMAIL_APP_PASSWORD` | optional, for LinkedIn alerts: Google Account → Security → 2-Step Verification → App passwords |

4. Actions → **daily job scan** → **Run workflow**. Check Telegram in ~5–10 minutes. It then runs daily at 08:00 WIB (edit the cron in `.github/workflows/daily.yml`).

## Interactive bot + dashboard (free, no server, no credit card)

```powershell
npm install
npx wrangler login              # opens the browser; a free Cloudflare account is enough
.\scripts\setup-worker.ps1      # asks for the secrets, deploys, registers the Telegram webhook, prints the dashboard link
```

Needs one more secret when asked: `GITHUB_TOKEN` — a fine-grained personal access token limited to your `career` repo with **Contents: read** and **Actions: read and write** (for `/pdf` and `/kirim`). Redeploy code changes with `npx wrangler deploy`.

On macOS/Linux run the same steps by hand: `npx wrangler deploy`, `npx wrangler secret put <NAME>` for each secret, then call Telegram's `setWebhook` with `url=https://<worker>/telegram` and `secret_token=<WEBHOOK_SECRET>`.

## Telegram commands

| Command | What it does |
| --- | --- |
| `/top [n]` | best matches: remote/WFH first, then fit score, then newest |
| `/baru` | jobs found in the last 2 days |
| `/remote` | remote / WFH / hybrid only |
| `/cari <word>` | search title/company |
| `/pdf <id>` | renders cv.md + cover-letter.md of that draft to PDF and sends both to you |
| `/kirim <id> <email>` | shows what would be sent; reply `/ya <id> <email>` to actually email CV + cover letter from your Gmail |
| anything else | answered by the LLM from the current job list |

Every job line ends with its `id`. Sent applications are marked ✅ and logged to `data/tracker.tsv` with a follow-up date.

## Adapting to another profession

- `profile/preferences.yaml` → `target_titles`, `seniority`, `nice_to_have_keywords`.
- `sources.yaml` → change `keywords` on the Jobstreet/Kalibrr entries; add or remove company boards (`provider` + `slug`).
- `src/scan.js` → `TITLE_RE` is a cheap pre-filter on titles; widen it for your field.
- `src/score.js` → the rubric in `SYSTEM` says what a 5 means; tune it to your market.

## Local use

```
cp .env.example .env     # fill in
npm run scan | score | draft | notify | daily
npm run bot              # VM-style long-running bot + dashboard on http://localhost:8080 (alternative to the Worker)
node src/pdf.js applications/<folder> ./out   # PDFs locally
```

## Costs

GitHub Actions and Cloudflare Workers free tiers are enough. OpenAI: ~100 postings/day scored with `gpt-4.1-mini` plus up to 8 drafts/day with `gpt-4.1` ≈ US$3–8/month. Set `DRAFT_LIMIT`, `MIN_FIT`, `MAX_AGE_DAYS`, `OPENAI_MODEL` as workflow env vars to tune.

## Privacy notes

- Your CV and all drafts live in your private repo and are sent to OpenAI for scoring/drafting.
- A Gmail App Password grants full mailbox access; consider a dedicated Gmail for job alerts.
- The dashboard is protected only by the `DASH_KEY` in its URL; rotate it with `npx wrangler secret put DASH_KEY`.

## License

MIT. Built by Najib Fauzan with Claude Code.
