# Lectheo

> **Find what you missed. Prove what you know.**

**Lectheo (LEK-thee-oh)** is an AI study partner for university CS students. It uses your lecture to find what _you personally_ don't understand, then makes you reason with it instead of just recalling it.

1. **Capture** — study the lecture brief in minutes or watch it, jump between AI chapters, and tap **L** ("I'm lost") or **I** ("Important") on what's unclear.
2. **Map** — Lectheo builds a concept map of the whole lecture; your markers sit on top.
3. **Diagnose** — a short, adaptive, confidence-rated diagnostic finds your _confident mistakes_.
4. **Practice** — _spot the flaw_, _teach-back_, _transfer problems_ and _Stump the AI_ (beta) make you use each idea.
5. **Master** — a concept turns green only after two independent correct answers, in two different activity types.

**Try it:** [lectheo.vercel.app](https://lectheo.vercel.app) → **Try the sample account** (no sign-up; a pre-loaded CS50
student with markers and a diagnostic already taken; deleted after 24 hours). Sign in with Google to add your own
lectures: a Google account starts empty, and the CS50 library is part of the sample account only. Demo video: _TODO link_.

Built for ForgeHacks 2026 (AI + Education). Product docs live in [`docs/`](docs/).

## Repository layout

```
apps/web              Next.js 16 app: UI, REST API (/api/v1), ingestion workflow
  src/app             pages + thin route handlers (auth → zod → service → response schema)
  src/server          server-only services by feature (auth, http, quota, lectures, ...)
  src/client          browser-only code (api client, capture: players, recorder, marker queue)
  src/components      UI components (shadcn/ui based)
  e2e                 Playwright (judge path, AI_FAKE=1)
packages/contracts    Zod schemas for every API request/response, enums, jsonb shapes
packages/db           Drizzle schema, migrations, PGlite test harness, CS50 seed fixture
packages/domain       pure, unit-tested rules (mastery, recommender, alignment, scoring, parsers)
packages/ai           the single AI seam: runTask() with role-based model routing + fake mode
docs                  product spec, architecture, API, data model, tech stack, workstreams
```

## Getting started

Requirements: Node 24, pnpm 12, Docker (only for the local Supabase stack).

```bash
pnpm install
cp .env.example apps/web/.env.local     # fill in keys, or `vercel env pull`
pnpm supabase start                     # local Postgres + Auth + Storage (Docker)
pnpm db:migrate && pnpm db:seed         # schema + CS50 library fixture + seed student
pnpm dev                                # http://localhost:3000
```

`AI_FAKE=1` makes every AI call deterministic and offline (tests, e2e, UI work without keys).

| Command                           | What                                                       |
| --------------------------------- | ---------------------------------------------------------- |
| `pnpm check`                      | typecheck + lint + unit tests for every package            |
| `pnpm test`                       | Vitest (domain rules, contracts, DB via in-process PGlite) |
| `pnpm e2e`                        | Playwright judge path (see below)                          |
| `pnpm db:generate`                | new Drizzle migration from `packages/db/src/schema.ts`     |
| `pnpm --filter @lectheo/ai smoke` | one live call per model role (needs `AI_GATEWAY_API_KEY`)  |

`pnpm e2e` needs `npx supabase start` running. It reads keys from `supabase status`, refuses a
non-local database, migrates + re-seeds it, then builds and serves the app on port 3100 with
`AI_FAKE=1` and Cloudflare's always-pass Turnstile test keys. Sign-in loads Turnstile and the
watch test loads YouTube (or the MP3 fallback), so it needs internet. First run:
`pnpm --filter @lectheo/web exec playwright install chromium`.

## Data and privacy

- **Imported video never leaves your laptop.** It plays locally; only the transcript is uploaded.
- Uploaded audio is **deleted after transcription**, and the copy at AssemblyAI is deleted too.
- Speaker names are stripped from imported transcripts.
- Deleting a lecture removes its media, transcript, markers and everything derived from it. Deleting a course does that for each of its lectures.
- Google accounts can be deleted at any time from the account menu: courses, files, counters, profile and sign-in go; only the AI cost ledger keeps a bare id.
- Sample accounts and all their data are deleted after 24 hours.
- No advertising, no tracking cookies, no analytics.

### What we store

| Data | Where | Kept until |
| --- | --- | --- |
| Google sign-in: name, email, Google account id (`openid email profile` only) | Supabase Auth, `profiles` | You delete your account (account menu) |
| Courses, lectures, transcript segments | `courses`, `lectures`, `transcript_segments` | You delete the lecture or course |
| Transcripts of public YouTube videos (no student data; shared across students) | `youtube_transcripts` | Kept as a cache |
| Uploaded audio | Supabase Storage, `audio` bucket | Transcription finishes |
| Uploaded transcript files (`.vtt`, `.srt`, `.txt`) | Supabase Storage, `transcripts` bucket | You delete the lecture or course |
| Your markers ("lost" / "important") | `markers`, `marker_concepts` | You delete the lecture or course |
| Generated concept map and questions | `concepts`, `concept_edges`, `concept_occurrences`, `items`, `item_secrets` | You delete the lecture or course |
| Your answers, confidence ratings, practice chats | `diagnostic_sessions`, `diagnostic_responses`, `activities`, `messages`, `attempts` | You delete the lecture or course |
| AI call ledger: task, model, token counts, cost (no prompt or answer text) | `llm_calls`, `usage_counters` | Kept for budget accounting |
| Your IP address, as the key of a counter for the sample-account button | `rate_limits` | Removed once older than 24 hours (cleared when the next sample account is created) |

Mastery is computed from `attempts` on every read; it is never stored separately.

### Who receives data

| Processor | Receives | When |
| --- | --- | --- |
| **Supabase** | Everything above (database, auth, storage) | Always |
| **Vercel** | Requests (hosting) and AI traffic (AI Gateway) | Always |
| **Anthropic** (via AI Gateway) | Lecture text, your practice answers | Generation, practice personas |
| **OpenAI** (via AI Gateway) | Lecture text, your practice answers | Verification, grading, leak-check escalation |
| **Google** (via AI Gateway) | Same as above | Fallback models only |
| **Google** (Gemini API, called directly) | The YouTube link you add (a public video), to transcribe it | Only when you add a YouTube lecture |
| **YouTube Data API** | The video's id, to check it (public, embeddable, length, language) | Only when you paste a YouTube link |
| **TypeSafe** (via AI Gateway) | The AI author's reply, plus the scenario and its intended correction (no personal data) | Leak check on Spot the flaw and Transfer replies |
| **AssemblyAI** | Your audio | Only when you upload audio |
| **Cloudflare Turnstile** | Browser signals for the bot check | Sample-account button only |
| **YouTube** | The player script (`www.youtube.com/iframe_api`) and the video embed (`youtube-nocookie.com`) | Watching a library or YouTube lecture; the preview thumbnail (`i.ytimg.com`) when you paste a link |
| **CS50** (`cdn.cs50.net`) | A request for the lecture's official MP3 | Only if the YouTube embed fails |

AI providers never receive your name or email.

## Quality

The CS50 library bank is generated offline by `scripts/seed-library.ts` from the official
subtitles (Opus 5.5 extraction and drafting, GPT-6.1 Sol blind verification, at most one redraft
round) and committed as fixtures, so seeding makes no AI calls. Evals write CSVs to `docs/evals/`:

| Check                                                                | Result                                                                                                                                                                                                     |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Library bank (18 concepts, 3 × 45-min windows)                       | 95 drafts, 6 rejected by the verifier (6%), one redraft round; then 18 reviewer-requested redrafts (all verified first try) and reviewed text fixes. 90 verified items, full F7.3 set. One-time cost $5.25 |
| `eval-items`: 20-item sample checked against key and cited subtitles | 20/20 correct key, single answer, grounded. Reviewed by Claude and checked by the author; an earlier human PR review found content issues this sample missed, now fixed (see `scripts/lib/reviewed.ts`)                          |
| `eval-judge`: 10 corrections × 3 runs (judge-correction)             | 100% score agreement (target ≥ 95%); majority matches the case label 10/10 (labels written by Claude, reviewed by the author)                                                                                |
| `eval-guard`: 15 adversarial author prompts (leak check)             | 1/15 first replies blocked and regenerated, 0/15 deflected to the canned reply, 0/15 shown replies judged leaking                                                                                          |

```bash
pnpm --filter @lectheo/scripts seed-library -- --emit   # AI_FAKE=0, AI_GATEWAY_KEY_NAME=dev
pnpm --filter @lectheo/scripts eval-items               # no model calls
pnpm --filter @lectheo/scripts eval-judge
pnpm --filter @lectheo/scripts eval-guard
```

## License

Code: [MIT](LICENSE). CS50-derived content (the library fixtures and the eval data built from them) is CC BY-NC-SA 4.0, not MIT; see [NOTICE](NOTICE).

## Library content

CS50x 2026 by Harvard University (Fall 2025 lecture recordings), [CC BY-NC-SA 4.0](https://cs50.harvard.edu/x/license/). Adapted by Lectheo (questions and maps generated). Not affiliated with or endorsed by CS50. Generated library content is shared under the same license. Videos are embedded, not re-hosted.
