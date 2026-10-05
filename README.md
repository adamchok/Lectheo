# Lectheo

> **Find what you missed. Prove what you know.**

**Lectheo (LEK-thee-oh)** is an AI study partner for university CS students. It uses your lecture to find what _you personally_ don't understand, then makes you reason with it instead of just recalling it.

1. **Capture** — tap **L** ("I'm lost") or **I** ("Important") while you watch or record a lecture.
2. **Map** — Lectheo builds a concept map of the whole lecture; your markers sit on top.
3. **Diagnose** — a short, adaptive, confidence-rated diagnostic finds your _confident mistakes_.
4. **Practice** — _spot the flaw_, _teach-back_, _transfer problems_ and _Stump the AI_ (beta) make you use each idea.
5. **Master** — a concept turns green only after two independent correct answers, in two different activity types.

**Try it:** [lectheo.vercel.app](https://lectheo.vercel.app) → **Try the sample account** (no sign-up; a pre-loaded CS50
student with markers and a diagnostic already taken; deleted after 24 hours). Google accounts start empty, for your own
lectures; the CS50 library is part of the sample only. Demo video: _TODO link_.

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
- Uploaded or recorded audio is **deleted after transcription**, and the copy at AssemblyAI is deleted too.
- Speaker names are stripped from imported transcripts.
- Deleting a lecture removes its media, transcript, markers and everything derived from it.
- Sample accounts and all their data are deleted after 24 hours.
- No advertising, no tracking cookies, no analytics.

### What we store

| Data | Where | Kept until |
| --- | --- | --- |
| Google sign-in: name, email, Google account id (`openid email profile` only) | Supabase Auth, `profiles` | You ask us to delete the account |
| Courses, lectures, transcript segments | `courses`, `lectures`, `transcript_segments` | You delete the lecture or course |
| Uploaded / recorded audio | Supabase Storage (`lecture_assets`) | Transcription finishes |
| Your markers ("lost" / "important") | `markers`, `marker_concepts` | You delete the lecture |
| Generated concept map and questions | `concepts`, `concept_edges`, `concept_occurrences`, `items`, `item_secrets` | You delete the lecture |
| Your answers, confidence ratings, practice chats | `diagnostic_sessions`, `diagnostic_responses`, `activities`, `messages`, `attempts` | You delete the lecture |
| AI call ledger: task, model, token counts, cost (no prompt or answer text) | `llm_calls`, `usage_counters` | Kept for budget accounting |
| Per-IP counters for the sample-account button | `rate_limits` | 24 hours |

Mastery is computed from `attempts` on every read; it is never stored separately.

### Who receives data

| Processor | Receives | When |
| --- | --- | --- |
| **Supabase** | Everything above (database, auth, storage) | Always |
| **Vercel** | Requests (hosting) and AI traffic (AI Gateway) | Always |
| **Anthropic** (via AI Gateway) | Lecture text, your practice answers | Generation, practice personas |
| **OpenAI** (via AI Gateway) | Lecture text, your practice answers | Verification, grading, leak-check escalation |
| **Google** (via AI Gateway) | Same as above | Fallback models only |
| **TypeSafe** (via AI Gateway) | Persona replies | Stump the AI leak check |
| **AssemblyAI** | Your audio | Only when you upload or record audio |
| **Cloudflare Turnstile** | Browser signals for the bot check | Sample-account button only |
| **YouTube** | Standard embed requests (`youtube-nocookie.com`) | Watching a library lecture |

AI providers never receive your name or email.

## Quality

The CS50 library bank is generated offline by `scripts/seed-library.ts` from the official
subtitles (Opus 5.5 extraction and drafting, GPT-6.1 Sol blind verification, at most one redraft
round) and committed as fixtures, so seeding makes no AI calls. Evals write CSVs to `docs/evals/`:

| Check                                                                | Result                                                                                                                                                                                                     |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Library bank (18 concepts, 3 × 45-min windows)                       | 95 drafts, 6 rejected by the verifier (6%), one redraft round; then 18 reviewer-requested redrafts (all verified first try) and reviewed text fixes. 90 verified items, full F7.3 set. One-time cost $5.25 |
| `eval-items`: 20-item sample checked against key and cited subtitles | 20/20 correct key, single answer, grounded. Reviewed by Claude, not a human; a human PR review found content issues this sample missed, now fixed (see `scripts/lib/reviewed.ts`)                          |
| `eval-judge`: 10 corrections × 3 runs (judge-correction)             | 100% score agreement (target ≥ 95%); majority matches the case label 10/10 (labels written by Claude; human review pending)                                                                                |
| `eval-guard`: 15 adversarial author prompts (leak check)             | 1/15 first replies blocked and regenerated, 0/15 deflected to the canned reply, 0/15 shown replies judged leaking                                                                                          |

```bash
pnpm --filter @lectheo/scripts seed-library -- --emit   # AI_FAKE=0, AI_GATEWAY_KEY_NAME=dev
pnpm --filter @lectheo/scripts eval-items               # no model calls
pnpm --filter @lectheo/scripts eval-judge
pnpm --filter @lectheo/scripts eval-guard
```

## License

Code: [MIT](LICENSE). The CS50 library content is licensed separately (below).

## Library content

CS50x 2026 by Harvard University, [CC BY-NC-SA 4.0](https://cs50.harvard.edu/x/license/). Adapted by Lectheo (questions and maps generated). Not affiliated with or endorsed by CS50. Generated library content is shared under the same license. Videos are embedded, not re-hosted.
