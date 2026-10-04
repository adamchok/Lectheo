---
title: Lectheo Tech Stack & Architecture Decisions
updated: 2026-10-04
version: v2 (post-review)
tags:
  - lectheo
  - architecture
  - stack
  - adr
related:
  - "[[Lectheo Architecture]]"
  - "[[Lectheo API Spec]]"
  - "[[Lectheo Data Model]]"
  - "[[Lectheo Product Spec]]"
  - "[[Lectheo Design Review v1]]"
---

# Lectheo Tech Stack & Architecture Decisions

Part of the architecture set: [[Lectheo Architecture]] · [[Lectheo API Spec]] · [[Lectheo Data Model]] · **Tech Stack & ADRs**

*Prices and versions were checked on 4 Oct 2026 (vendor pages, the AI Gateway catalog, npm). Re-check before relying on any number.*

---

## 1. Constraints that drive every choice

| Constraint | Consequence |
|---|---|
| One developer, about 6 days | One app, one language, managed services, **no ceremony layers**. Pre-generate everything the judge path needs. |
| Judges open a link and try it | Sign-in page with a **per-visitor sample account**. The CS50 library is pre-processed, so the judge path makes no slow calls. |
| Public URL, ≈ **$50** total | Free-tier infrastructure. Hard spend caps at **two levels** (gateway key budgets + an app governor). Bot protection on sample sign-in. |
| Content must be *correct* | Exact checks in code where possible. Independent verifier (different model family). Fixed rubrics. |
| Chrome on a laptop | Can use the YouTube IFrame API, `MediaRecorder`, Wake Lock and IndexedDB. |
| "Be honest about what runs" | Cost and quality ledgers, plus eval scripts whose numbers go in the README. |

---

## 2. Stack at a glance

| Layer | Choice | Version | Why |
|---|---|---|---|
| Language | **TypeScript** (strict) | – | Shared Zod types from the DB to the UI. STT and LLMs are APIs, so no Python is needed. |
| Framework | **Next.js** App Router + Route Handlers (`proxy.ts` for session refresh) | 16.3.x | UI + API in one deploy. Streaming. |
| UI | **React**, **Tailwind CSS v4**, **shadcn/ui** | Tailwind 4.3.x | Fast, accessible, keyboard-friendly. |
| Concept map | **React Flow** (`@xyflow/react`) + **elkjs** (layout computed once in the pipeline, stored) | 12.12.x / 0.12.x | Custom nodes (state icon + label). Stable layered layout. |
| Media | **YouTube IFrame Player API** (library), HTML `<video>`/`<audio>` with local object URLs (imports), `MediaRecorder` (live, Should) | – | Marker time = media time. Imported video never uploaded. |
| Hosting | **Vercel Hobby** (Fluid compute) | – | Free. 300 s per function. Preview deploys. Daily cron. |
| Background pipeline | **Vercel Workflows** (`workflow`) with **polling, no webhook** | 5.0.x | Durable steps, retries, `sleep`. Hobby includes 50k events/month. |
| LLM SDK | **AI SDK** (`ai`) + `@ai-sdk/gateway` | 7.0.x (≥ 7.0.105 for `experimental_evaluate`) | Structured output (Zod), streaming chat, Jev decisions, telemetry. |
| LLM routing & spend | **Vercel AI Gateway**, **two API keys** (`dev`, `prod`) each with a hard budget | – | Zero markup, one bill, 402 when a budget is hit, fallbacks, logs. |
| Speech-to-text | **AssemblyAI Universal-3.5 Pro** (async, polled), **only for live and audio-upload sources** | SDK `assemblyai` 4.x | Keyterm boosting from slides, word timestamps, ~185 free hours. Imported transcripts skip it entirely. |
| Database, Storage, Auth | **Supabase via the Vercel Marketplace**: Postgres, private Storage, **Google OAuth + anonymous (sample) users** | `@supabase/supabase-js` 2.117 / `@supabase/ssr` 0.12 | One integration, env vars auto-synced, no separate account. **Data API off, RLS deny-all.** |
| ORM | **Drizzle** + `postgres` (postgres.js) via the transaction pooler (`prepare: false`, `max: 3`) | 0.45.x / 3.4.x | Typed SQL, migrations as code. |
| Bot protection | **Cloudflare Turnstile** | – | Free. Protects the sample-account button. |
| Transcript parsing | Own small VTT/SRT parser (`domain/`). `mammoth` for Teams `.docx` (Should) | – | Simple formats. Pure and tested. |
| Validation | **Zod 4** | 4.x | API input, LLM output and JSON columns share schemas. |
| Client storage | **IndexedDB** (`idb-keyval`) | – | Marker queue and recording pieces survive crashes. |
| Tests | **Vitest** (domain + contract), **Playwright** (judge path, fake media), eval **scripts** (CSV output) | – | Right-sized: no Docker integration suite. |
| CI | GitHub Actions (typecheck, lint, unit) + Vercel previews | – | |

### Model routing table

All slugs live in `server/ai/models.ts` and were checked against the live AI Gateway catalog on 4 Oct 2026. *Decision 4 Oct: Option B (Sonnet generates, Opus only for the library seed, GPT-6.1 Sol checks and grades once). Jev chosen for the leak check.*

| Role | Used for | Primary | Settings | Fallback |
|---|---|---|---|---|
| `reasoner` | Concept extraction, item drafting for user lectures, on-demand items | `anthropic/claude-sonnet-5.5` | medium effort (pipeline), low (on demand), structured output | `google/gemini-3.8-flash` |
| `reasoner-premium` | **Library seed only** (`scripts/seed-library.ts`, dev key) | `anthropic/claude-opus-5.5` | medium effort | `anthropic/claude-sonnet-5.5` (high) |
| `verifier` | Blind-solve and check every generated item | `openai/gpt-6.1-sol` | medium effort | `openai/gpt-6-sol` (never Claude, to keep independence) |
| `judge` | Spot-flaw correction, teach-back coverage, transfer, Stump referee | `openai/gpt-6.1-sol` | medium effort, criterion-level 0–2 output, single run | `google/gemini-3.8-flash` (outage only, recorded in `attempts.judge_model`) |
| `persona` | Confused friend, author | `anthropic/claude-sonnet-5.5` | low effort, ≤ 600 output tokens incl. reasoning, streamed (teach-back) | `google/gemini-3.8-flash` |
| `answerer` | The AI's answer in Stump the AI | `anthropic/claude-sonnet-5.5` | medium effort | `google/gemini-3.8-flash` |
| `guard` | Leak check on author replies | `typesafe-ai/jev` | 2 boolean questions, timeout 800 ms | `guard-escalation` |
| `guard-escalation` | Gray zone (0.3–0.7) or Jev unavailable | `openai/gpt-6-luna` | low effort, boolean + reason | canned deflection (fail closed) |
| `vision` *(Should)* | Slides PDF pages that have no text layer | `google/gemini-3.8-flash` | low thinking | `anthropic/claude-sonnet-5.5` |

> **Why the verifier and judge aren't Claude:** generation, personas and the Stump answerer are Claude. A different family checking and grading avoids correlated blind spots and self-preference bias.

### 2.1 How each model was chosen

Benchmarks used (checked 4 Oct 2026):
- **AA**: Artificial Analysis Intelligence Index, a reasoning composite.
- **EQ-Bench 4**: roleplay and social-intelligence Elo.
- **Judgemark v4**: how well a model discriminates when grading.
- **OCR Elo**: complex-document OCR tournament.

| Role | Candidates | Evidence | Pick |
|---|---|---|---|
| Persona | Haiku 4.5 · Sonnet 5.5 · Kimi K3 · DeepSeek V4.1 Flash · Qwen3.8 Max | **Haiku 4.5 is weak** (AA 17, EQ-Bench 1064). Sonnet 5.5 low effort: AA 36–41, first token ~1.2 s, ~95 tok/s. Kimi K3: EQ-Bench 1339 but ~4 s to first token, ~40 tok/s, $3/$15. Qwen3.8 Max: slow, EQ-Bench 1110. | **Sonnet 5.5 (low)** |
| Reasoner | Opus 5.5 · Sonnet 5.5 · GPT-6.1 Sol · Fable 5.1 | Opus 5.5 is top (AA 51 at medium) but 2× Sonnet's price. Sonnet 5.5 (high) reaches AA 47, and the verifier filters misses. | **Sonnet 5.5** live, **Opus 5.5 for the library seed** |
| Verifier | GPT-6.1 Sol · Gemini 3.8 Flash · GLM-5.3 | Sol medium: AA 48 at ~$0.21 per AA task. Gemini 3.8 Flash high: AA 41 at ~$1.24. | **GPT-6.1 Sol** |
| Judge | GPT-6.1 Sol · Sonnet 5.5 · Gemini 3.8 Flash · open models | Open models judge poorly (Judgemark: DeepSeek V4 Pro 47, Qwen3.6-Max 45, vs GPT-5.5 88). Sol is strongest outside the Claude family. | **GPT-6.1 Sol**, single run |
| Vision (Should) | Gemini 3.8 Flash · Claude Sonnet 5 | OCR tournament: Gemini 3.8 Flash (low thinking) Elo 1022, ~$0.011/page; Sonnet 5 Elo 997 at 3.4× the cost. | **Gemini 3.8 Flash (low)** |
| Guard | **Jev** · DeepSeek V4.1 Flash · GPT-6 Luna | Jev: decision-only, typed probabilities, ~76 ms median, $0.042 per M input, output free, 91.5% agreement with Fable 5.1 in a third-party eval. Weak at multi-step reasoning and adversarial input, which is acceptable for a yes/no check on the persona's own reply. | **Jev** + Luna for the gray zone |

**Open models:** not on the runtime path. Kimi K3 (great roleplay, too slow), DeepSeek V4.1 Flash (Jev is faster for yes/no), Qwen3.8 Max (slow, weaker judge), GLM-5.3 (decent, but Sol is stronger). **Watch:** Gemini 4 Argon (AA 53) has no public API yet.

**Newness risk:** Sonnet 5.5 (28 Sep), GPT-6.1 Sol (29 Sep) and Jev (early Oct) are days old. Pin the slugs and run a smoke test of every role on day 1.

---

## 3. Cost model and budget

### Unit costs (list prices; thinking tokens are billed as output)

| Operation | Models | Cost |
|---|---|---|
| **Library seed** (3 × CS50 core 30–45 min, ~12 concepts each, ~160 items: 2 MCQ + 2 flaw per concept + transfer for half) | Opus 5.5 + GPT-6.1 Sol | **≈ $10–12, once** (dev key) |
| Ingest a user lecture, **imported transcript**, 60 min (extraction + ~12 diagnostic items + ~6 practice items, verified) | Sonnet 5.5 + Sol | ≈ $0.80 (no STT) |
| Same, **audio** source | + AssemblyAI ≈ $0.26/h | ≈ $0.80 (STT covered by free hours) |
| 20-min sample-tier lecture | | ≈ $0.30 |
| Diagnostic | none (graded in code) | $0 |
| Spot the flaw (pre-generated item; ~4 author turns + Jev + 1 judge call) | Sonnet + Jev + Sol | ≈ $0.05 |
| Teach-back (~4 turns + 1 judge call) | Sonnet + Sol | ≈ $0.05 |
| Transfer / Stump (Should) | Sol / Sonnet + Sol ×2 | ≈ $0.03 / $0.07 |
| On-demand item (if the bank runs out) | Sonnet + Sol | ≈ $0.05 |
| **Judge path** (diagnostic + spot the flaw + teach-back) | | **≈ $0.10–0.15** |

### Budget ($50) and enforcement

| Key / bucket | Budget | Covers |
|---|---|---|
| `dev` gateway key | **$25** (hard, no refresh) | Development, prompt iteration, eval scripts (~$1–2 per run), **library seed (~$12)** |
| `prod` gateway key | **$25** (hard, no refresh) | Deployed app during judging: ≈ 100+ judge paths plus some real uploads |
| Infrastructure | $0 | Vercel Hobby, Supabase free (via Vercel), Workflows, AssemblyAI free hours, Turnstile |

**App spend governor** (prod), checked in `runTask` against `llm_calls`:
- ≥ $3 in the last hour, or ≥ 75% of the prod budget → `intake_paused` (no new processing or on-demand generation).
- ≥ 95% → `ai_paused`. Library practice on pre-generated items continues until then.

Per-user quotas are in [[Lectheo Architecture#9.2 Abuse and cost]]. **Cost switches** in `models.ts`: `reasoner` → Opus 5.5 if verifier rejections are high (≈ 2× generation cost).

---

## 4. Architecture Decision Records

Format: context → decision → consequences. All **Accepted, 4 Oct 2026** (v2 revisions after the [[Lectheo Design Review v1]]).

### ADR-001 · TypeScript monolith on Next.js, right-sized structure
- **Context:** Solo developer, 6 days.
- **Decision:** One Next.js app, organized by feature (`server/<feature>`), with pure rules in `domain/` and **one seam**: `runTask()` with a fake mode. No ports, adapters or lint-enforced layers.
- **Consequences:**
  - \+ Fast to build and easy to test where it matters (domain rules, contracts).
  - − Swapping a vendor means editing one module. Acceptable.
- **Rejected:** hexagonal layering (ceremony at this size), a Python backend, microservices.

### ADR-002 · Durable pipeline on Vercel Workflows, polling instead of a webhook
- **Context:** Lecture processing takes minutes, includes an external wait (transcription), must be safe to retry, and must not double-bill.
- **Decision:**
  - `processLecture` is a workflow of `'use step'` functions backed by a **`pipeline_steps`** table.
  - The transcription job ID is **reserved before submitting**. Completion is detected by a **poll loop** (`sleep(15s)` until terminal status, max 60 min).
  - Validation failures throw `FatalError`.
  - Claims use guarded updates plus "one processing lecture per course".
  - Re-runs add new rows and retire old items.
- **Consequences:**
  - \+ No webhook authentication gap or race, works in local dev, idempotent and resumable.
  - − Polling adds up to 15 s of latency and a few workflow events (well within Hobby's 50k).
  - − Run state is kept for only 1 day on Hobby; `pipeline_steps` is our record.
- **Fallback:** if the day-1 spike fails, chain the same step functions through route handlers with `after()`. A cron runner isn't viable because Hobby cron runs daily.

### ADR-003 · Supabase via the Vercel Marketplace, server-only data access
- **Context:** Need relational data, private uploads, Google sign-in and per-visitor sample users, with minimal accounts.
- **Decision:**
  - Supabase installed as a Vercel native integration (no separate account, env vars synced).
  - **Server-only database access:** Data API disabled for `public`, RLS enabled with **no policies**, secrets in `item_secrets` and 🔒 columns, allow-list response schemas.
  - The browser uses Supabase only for **Google OAuth**, **anonymous sample sign-in (server-side, on click, Turnstile)** and **signed uploads**.
- **Consequences:**
  - \+ The publishable key can't read any table. Authorization is in one place (app code), backed by a contract test.
  - − Free-plan limits: 500 MB DB, 50 MB per file, pauses after 7 days idle. A daily cron hits `/api/v1/health`.
  - − The anonymous sign-in rate limit must be raised (default 30/h per IP) for judges on one network.
- **Rejected:** RLS as the main authorization (the server connection bypasses it, and policies would duplicate app logic); a separate Supabase account; Neon + Blob + Clerk.

### ADR-004 · Transcripts first, speech-to-text only when needed
- **Context:** Most university recordings (Teams, Panopto, Echo360, Zoom) already include a timestamped transcript (.vtt / .srt). CS50 publishes official subtitles.
- **Decision:**
  - **Import the transcript whenever one exists** (library, recording import, transcript upload). Speaker names are stripped.
  - Use AssemblyAI Universal-3.5 Pro (polled, slide keyterms) **only for live recordings and audio-only uploads**.
  - Audio is deleted after transcription, and the remote transcript is deleted at AssemblyAI.
- **Consequences:**
  - \+ Faster, cheaper, more accurate timing, better privacy.
  - − Must handle transcript format quirks (VTT/SRT first; Teams .docx is Should).
- **Alternative:** Deepgram Nova-3 (keyterms capped at 500 tokens), if AssemblyAI is down.

### ADR-005 · Best-model-per-role through Vercel AI Gateway (Option B)
- **Context:** Quality matters most for item generation and grading; latency matters for chat; the budget is small.
- **Decision:**
  - Role-based routing ([[#2. Stack at a glance|§2]]): Sonnet 5.5 generates and plays personas. Opus 5.5 is used only for the library seed. GPT-6.1 Sol verifies and judges (single run). Jev guards, with Luna for the gray zone.
  - **Two gateway keys** (`dev` / `prod`) with hard budgets, plus the app governor.
- **Consequences:**
  - \+ Single integration, independent checking, development can't drain the judging budget.
  - − Five vendors behind one gateway, so each role needs smoke tests and eval cases.
- **Not used at runtime:**
  - **Featherless** (sponsor): concurrency limits and no guaranteed structured output.
  - **Adaption, Momen, n8n:** not a fit for the runtime.
  - DevSwarm and ProjectAAL credits may still help during the build.

### ADR-006 · No vector database or embeddings
- **Decision:** Concept deduplication passes the course's existing concept list (< 200 items) into the extraction prompt, plus a `canonical_key` unique constraint. Revisit above ~500 concepts per course.

### ADR-007 · REST with one /activities resource and safe retries without an idempotency store
- **Context:** The reviewers found inconsistent conversation/activity endpoints and a 202-replay bug.
- **Decision:**
  - REST under `/api/v1`. All practice types share `/activities` (create, messages, hints, submit, explanation).
  - Retries are safe through **client-generated UUIDv7 IDs + `ON CONFLICT DO NOTHING`** and **guarded state transitions**. No `Idempotency-Key` table and no `If-Match`.
  - On-demand generation **blocks** (≤ 25 s). Teach-back streams over SSE; author replies are JSON (because of the leak check).
- **Consequences:**
  - \+ Less machinery, a clear contract, simple tests.
  - − Long-blocking requests need `maxDuration = 60` on that route.

### ADR-008 · Mastery computed on read from attempts
- **Context:** v1's evidence log and mastery cache created race conditions and duplicated data.
- **Decision:** `attempts` is the single source of truth. `computeMastery()` (pure) runs on read for each concept. Attempts carry `try_no`, `assisted` and `judge_model`.
- **Consequences:**
  - \+ No cache to keep consistent, no advisory locks, rules can be changed and replayed.
  - − A small amount of CPU per map request (≤ 60 concepts).

### ADR-009 · Information hiding by construction
- **Decision:**
  - Answer keys, flaws, rubrics, hints and leak keywords live in `item_secrets` / 🔒 columns, never in client DTOs or persona prompts.
  - The author persona believes its scenario is correct.
  - Spot-flaw verdict and location are checked in code. Only the correction goes to the judge.
  - Rubrics are frozen into `activities.rubric_snapshot`.
  - Author replies are capped at 150 tokens and leak-checked before display ([[#ADR-013 · TypeSafe Jev as the leak check, with an LLM escalation|ADR-013]]).
- **Consequences:**
  - \+ Leak risk reduced structurally.
  - − Author replies aren't streamed (~2.5–3.5 s).

### ADR-010 · Generate → verify → publish, with a pre-generated library bank
- **Decision:**
  - Every item is verified blind by a different model family before use.
  - The **CS50 library bank is generated in advance** with Opus (every concept: 2 MCQ, 2 flaw scenarios (~30% correct), a teach-back rubric, transfer for half).
  - User lectures get diagnostic items plus practice for the top 3 concepts in the pipeline; the rest are generated on demand.
  - Items a user has already seen are never served again.
- **Consequences:**
  - \+ The judge path makes no generation calls.
  - − ≈ $10–12 one-time seed cost.

### ADR-011 · Capture modes share one timeline: media time
- **Decision:**
  - Markers are stored as **media time** (position in the video or audio).
  - Watch mode reads the YouTube player time. Import plays the local file and reads `video.currentTime`; the file is never uploaded.
  - Live recording computes time from recorder pieces. Recorder sessions are never stitched across sleep or crashes.
  - Marking during a live Teams meeting with later alignment is *Later*.
- **Consequences:**
  - \+ No offset field, exact alignment with VTT/SRT timestamps.
  - − Plain-text transcripts can't carry markers (the UI explains this).

### ADR-012 · Grounding by stable segment keys
- **Decision:**
  - Segments are keyed `(lecture_id, idx)`. Prompts cite `[s42]`. Every output schema requires citations, and the server rejects unknown ones.
  - Edits never re-segment.
  - Stump referee notes may cite `course_knowledge`, and the UI says so.

### ADR-013 · TypeSafe Jev as the leak check, with an LLM escalation
- **Decision:**
  - Order: keyword regex → **Jev** (state: scenario sentences, flaw sentence index, flaw summary, correction, reply; questions: *reveals or hints at the flawed sentence*, *states or implies the correction*) → `p = max`.
  - `< 0.3` pass, `> 0.7` block (regenerate once, then canned deflection), gray zone → GPT-6 Luna.
  - Jev timeout 800 ms → Luna. Luna failure → deflection.
  - Thresholds tuned with `scripts/eval-guard.ts`. Decisions logged in `messages.guard`.
- **Consequences:**
  - \+ ~0.1 s, near-zero cost, explicit and tunable thresholds, and a clear "decision model vs LLM" story for the judges.
  - − Experimental API and days old, so it's pinned and has a fallback.
  - − Jev can't explain its decisions; the Luna escalation does.

### ADR-014 · Per-visitor sample accounts cloned from a seed student
- **Context:** Judges need instant access to a realistic, non-"demo" dashboard, and several judges may test at once.
- **Decision:**
  - The button creates an anonymous user (Turnstile-protected, server-side, on click).
  - `clone_sample()` copies the seed student's per-user rows in one transaction. Library content stays shared and read-only.
  - The account menu shows "Sample account · progress resets when you leave" plus Reset. A daily purge removes accounts older than 24 h.
- **Consequences:**
  - \+ No collisions, a clean start every time, and it looks like the real product.
  - − Seed data must be kept in step with the library item IDs (built by the same seed script).

### ADR-015 · CS50 library content under CC BY-NC-SA 4.0
- **Decision:**
  - Use CS50x 2026 Lectures 3–5 (the core 30–45 min of each), official subtitles and slides.
  - Videos are **embedded** (YouTube IFrame API), not re-hosted. The official MP3 is the fallback player.
  - An attribution notice is shown on every library page. Generated library content is shared under the same license. There's no implied endorsement.
- **Consequences:**
  - \+ High-quality, recognisable, verifiable content.
  - − Non-commercial only. A commercial version would need different demo content.

---

## 5. Deliberately not used

| Not used | Why |
|---|---|
| Hexagonal ports, `eslint-plugin-boundaries`, Clock/IdGen ports | Ceremony for a 6-day build ([[#ADR-001 · TypeScript monolith on Next.js, right-sized structure\|ADR-001]]) |
| Transcription webhook | Polling is simpler and safer ([[#ADR-002 · Durable pipeline on Vercel Workflows, polling instead of a webhook\|ADR-002]]) |
| Idempotency-key table, `If-Match` | UUIDv7 + `ON CONFLICT` + guarded updates ([[#ADR-007 · REST with one /activities resource and safe retries without an idempotency store\|ADR-007]]) |
| Evidence log, mastery cache | Computed on read ([[#ADR-008 · Mastery computed on read from attempts\|ADR-008]]) |
| Admin quality page | SQL in Supabase Studio + eval CSVs |
| Redis / queues / WebSockets / Realtime | Postgres counters, workflows, polling and SSE are enough |
| Vector DB / RAG | Lecture context fits in the prompt ([[#ADR-006 · No vector database or embeddings\|ADR-006]]) |
| Video upload, in-browser audio extraction | Video stays local. Transcript or audio export instead |
| Featherless / Kimi fallback / Jev marker tie-break / 3-run judging | Cut for simplicity after review |
| Fine-tuning | No labeled data. Prompting + verification is enough |

---

## Sources

- Vercel: [Functions limits](https://vercel.com/docs/functions/limitations), [Workflows](https://vercel.com/docs/workflows), [Workflows pricing/limits](https://vercel.com/docs/workflows/pricing), [AI Gateway pricing](https://vercel.com/docs/ai-gateway/pricing), [AI Gateway budgets](https://vercel.com/docs/ai-gateway/observability-and-spend/budgets), [model fallbacks](https://vercel.com/docs/ai-gateway/models-and-providers/model-fallbacks), [live model catalog](https://ai-gateway.vercel.sh/v1/models)
- AI SDK: [AI SDK 6](https://vercel.com/blog/ai-sdk-6), [AI SDK 7](https://vercel.com/blog/ai-sdk-7), [migration 7.0](https://ai-sdk.dev/docs/migration-guides/migration-guide-7-0)
- Models: [Claude pricing](https://platform.claude.com/docs/en/about-claude/pricing), [Claude structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs), [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing), [OpenAI pricing](https://openai.com/api/pricing/)
- Benchmarks: [Artificial Analysis](https://artificialanalysis.ai/leaderboards/models), [EQ-Bench 4](https://eqbench.com/), [Judgemark v4](https://eqbench.com/judgemark-v4.html), [Gemini 3.8 Flash OCR benchmark](https://github.com/luseloso/gemini-thinking-ocr-benchmark), [Gemini 4 Argon availability](https://aireiter.com/blog/gemini-4-argon-api-pricing-availability)
- Jev: [Vercel guide](https://vercel.com/kb/guide/typesafe-jev-and-ai-sdk), [InfoQ](https://www.infoq.com/news/2026/10/typesafe-ai-jev-released/), [benchmarks](https://www.layer3labs.io/guides/jev-benchmarks), [Langfuse](https://langfuse.com/blog/2026-09-18-using-typesafes-jev-for-evals)
- AssemblyAI: [pricing](https://www.assemblyai.com/pricing), [keyterms](https://www.assemblyai.com/docs/pre-recorded-audio/keyterms-prompting), [file limits](https://www.assemblyai.com/docs/faq/are-there-any-limits-on-file-size-or-file-duration-for-files-submitted-to-the-api). Deepgram: [pricing](https://deepgram.com/pricing)
- Supabase: [Vercel Marketplace](https://vercel.com/marketplace/supabase), [integration docs](https://supabase.com/docs/guides/integrations/vercel-marketplace), [pricing](https://supabase.com/pricing), [file limits](https://supabase.com/docs/guides/storage/uploads/file-limits), [anonymous sign-ins](https://supabase.com/docs/guides/auth/auth-anonymous)
- Transcript sources: [Teams transcript download](https://whisprinote.com/blog/how-to-download-a-microsoft-teams-meeting-transcript-2026), [Panopto captions](https://support.panopto.com/s/article/How-to-Download-Captions), [Echo360 transcripts](https://whisprinote.com/blog/echo360-transcript-2026-download-txt-vtt)
- CS50: [license (CC BY-NC-SA 4.0)](https://cs50.harvard.edu/x/license/), [CS50x 2026 week pages (subtitles, transcripts, slides, MP3)](https://cs50.harvard.edu/x/weeks/1/)
- Featherless: [plans](https://featherless.ai/docs/plans). Adaption: [docs](https://docs.adaptionlabs.ai/)
- Browser: [Chrome background tabs](https://developer.chrome.com/blog/background_tabs), [Wake Lock](https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API)
