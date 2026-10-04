---
title: Lectheo Design Review (4 Oct 2026)
updated: 2026-10-04
tags: [lectheo, review]
related: ["[[Lectheo Product Spec]]", "[[Lectheo Competition]]", "[[Lectheo Architecture]]", "[[Lectheo Tech Stack]]", "[[Lectheo Data Model]]", "[[Lectheo API Spec]]"]
---

# Lectheo Design Review — 4 Oct 2026

Three independent AI reviewers (senior PM, senior system design engineer, senior software engineer) read the v1 docs. This note combines what they found. **All findings were resolved in the v2 docs on 4 Oct 2026**; see the resolution table directly below.

## Consolidated verdict

All three agree: the idea and the quality design (verification gate, hidden keys, code-computed scores, grounding) are strong, but **the scope is sized for a team, not 6 solo days**, and the judge's demo path doesn't show the main differentiator. Overall risk: **high**, mostly from scope and a handful of concrete correctness bugs.


## Resolution (v2 docs, 4 Oct 2026)

| # | Finding | Resolution | Where |
|---|---|---|---|
| 1 | Judges never see their own confusion detected | **Sample account** (a fresh copy per visitor) with **Lecture 5 ready to watch** in **watch mode**. Judges tap L/I during a first viewing, and the diagnostic uses their markers. No "demo" banner | Spec [[Lectheo Product Spec#F0. Accounts, sample account and dashboard — Must\|F0]], [[Lectheo Product Spec#F1. Capture with markers — Must (by mode)\|F1.4]], [[Lectheo Product Spec#4.1 Judge path (target: under 2 minutes)\|§4.1]] · Arch [[Lectheo Architecture#4.1 Sign-in and sample account (F0)\|§4.1]]–[[Lectheo Architecture#4.2 Capture modes (F1)\|4.2]] · [[Lectheo Tech Stack#ADR-014 · Per-visitor sample accounts cloned from a seed student\|ADR-014]] |
| 2 | Scope too large | Must / Should / Later tiers. Spot the flaw is the main activity, teach-back supports it. Transfer, Stump, live recording, slides and transcript edit are Should. PiP, photos, offset, streak and tiers are Later. Library bank pre-generated | Spec [[Lectheo Product Spec#3. Features\|§3]], [[Lectheo Product Spec#7. Scope boundaries\|§7]] · [[Lectheo Tech Stack#ADR-010 · Generate → verify → publish, with a pre-generated library bank\|ADR-010]] |
| 3 | RLS false claim / answer keys reachable | Data API off, **RLS deny-all**, `item_secrets` table, allow-list response schemas + contract test | Data Model conventions · [[Lectheo Tech Stack#ADR-003 · Supabase via the Vercel Marketplace, server-only data access\|ADR-003]], [[Lectheo Tech Stack#ADR-009 · Information hiding by construction\|ADR-009]] |
| 4 | Pipeline not idempotent | `pipeline_steps` table, `stt_job_id` reserved before submit, **polling instead of webhook**, guarded claim + one processing lecture per course, `FatalError`, segment PK `(lecture_id, idx)`, re-runs retire items | Arch [[Lectheo Architecture#4.3 Ingestion pipeline\|§4.3]] · [[Lectheo Tech Stack#ADR-002 · Durable pipeline on Vercel Workflows, polling instead of a webhook\|ADR-002]], [[Lectheo Tech Stack#ADR-012 · Grounding by stable segment keys\|ADR-012]] |
| 5 | Grading and evidence races | `diagnostic_responses` PK, guarded state transitions, `UNIQUE (activity_id, try_no)`, mastery computed on read (evidence and cache removed), `assisted` set per attempt | Data Model · [[Lectheo Tech Stack#ADR-007 · REST with one /activities resource and safe retries without an idempotency store\|ADR-007]], [[Lectheo Tech Stack#ADR-008 · Mastery computed on read from attempts\|ADR-008]] |
| 6 | Cost cap leaks | Turnstile on sample sign-in (Must), sign-in on click only, per-tier upload limits at signed-URL time, token caps, re-run quota, **app spend governor**, **separate dev/prod gateway keys** | Arch [[Lectheo Architecture#9.2 Abuse and cost\|§9.2]] · Tech Stack [[Lectheo Tech Stack#3. Cost model and budget\|§3]] |
| 7 | "Record 2 minutes" fails its rules | Preset removed. Node and item counts scale with length (min 3). Status `map_ready` before items. Realistic NFRs | Spec [[Lectheo Product Spec#F2. Concept map — Must\|F2.2]], [[Lectheo Product Spec#F3. Adaptive, confidence-rated diagnostic — Must\|F3.1]] · Arch [[Lectheo Architecture#1. Architectural goals\|§1]], [[Lectheo Architecture#4.3 Ingestion pipeline\|§4.3]] |
| 8 | Doc contradictions | Unified `/activities`, one diagnostic contract, turn budget 6, author cap 150 tokens, one step enum, `/api/v1/health`, single cost table | All v2 docs |
| 9 | Recording ethics | Consent prompt, audio deleted after transcription, speaker names stripped, imported video never uploaded, README data statement | Spec [[Lectheo Product Spec#F8. Trust, privacy and limits — Must\|F8]] · Arch [[Lectheo Architecture#9.3 Data protection\|§9.3]] |
| 10 | Name collision | **Renamed to Lectheo** (4 Oct 2026). lectheo.com and github.com/lectheo were free when checked | Spec [[Lectheo Product Spec#10. Open product questions\|§10]] |
| — | Mastery rule contradiction | Green = 2 **independent** correct answers in different activity types, ≥ 1 non-MCQ. Diagnostic counts only when Sure. Hints and explanations make an attempt assisted | Spec [[Lectheo Product Spec#F6. Mastery map — Must\|F6]] · Arch [[Lectheo Architecture#6.2 Mastery\|§6.2]] |
| — | Rubric reveal vs Socratic retry | One retry. Explanation and rubric revealed after the final try | Spec [[Lectheo Product Spec#F4c. Spot the flaw — Must (the main activity)\|F4c.8]] · API submit |
| — | Spot-flaw verdict and location in code | Done. Only the correction goes to the judge | Spec [[Lectheo Product Spec#F4c. Spot the flaw — Must (the main activity)\|F4c.6]] · [[Lectheo Tech Stack#ADR-009 · Information hiding by construction\|ADR-009]] |
| — | Judge has no fallback | Gemini 3.8 Flash fallback (outage only), recorded in `attempts.judge_model` | Tech Stack routing |
| — | `maxOutputTokens` vs reasoning | Limits raised (judge 4k, extraction 16k, persona 600) | Arch [[Lectheo Architecture#5.1 Tasks and runTask()\|§5.1]] |
| — | 202 + idempotency replay | On-demand generation blocks ≤ 25 s | API `POST /activities` |
| — | Cron fallback impossible on Hobby | Fallback is an `after()` chain | [[Lectheo Tech Stack#ADR-002 · Durable pipeline on Vercel Workflows, polling instead of a webhook\|ADR-002]] |
| — | Library and SDK gotchas | `proxy.ts`, `getClaims()`, postgres.js `max: 3`, explicit Anthropic cache control, `consumeStream()`, recorder sessions not stitched, raised anonymous sign-in limit | Arch [[Lectheo Architecture#3. Code organization\|§3]]–[[Lectheo Architecture#4. Key flows\|4]], API [[Lectheo Architecture#9. Security, abuse and cost\|§9]] |
| — | Over-engineering | Ports, lint layering, idempotency store, `If-Match`, admin page, Kimi/Featherless, linker and 3-run judging removed. Evals right-sized | Tech Stack [[Lectheo Tech Stack#5. Deliberately not used\|§5]] |
| — | Competition overclaims | PeerWise and error-finding pedagogy acknowledged. "First in AI lecture tools", "defensible for now" | Competition [[Lectheo Competition#1. Summary\|§1]], [[Lectheo Competition#5. Where Lectheo wins: positioning\|§5]] |
| — | Jev (reviewers suggested deferring) | **Kept by owner decision**, simplified to 2 questions with Luna escalation and fail-closed | [[Lectheo Tech Stack#ADR-013 · TypeSafe Jev as the leak check, with an LLM escalation\|ADR-013]] |

## Must-fix before coding (agreed by 2+ reviewers)

| # | Issue | Fix |
|---|---|---|
| 1 | **Judges never get *their own* confusion detected**: sample markers are pre-made, and replay marking is banned. | Add a **Demo mode**: judge taps L/I over a 2–4 min sample clip, and the diagnostic is built from their taps on the pre-processed lecture. |
| 2 | **Scope too large** for 6 days (≈45 P0 requirements). | Hero path = diagnostic → spot the flaw → teach-back. Demote transfer, Stump, photos/OCR, offset, PiP, streak, persona picker. Pre-generate the whole demo item bank. |
| 3 | **RLS claim is false**: the server bypasses RLS, and the browser's publishable key exposes PostgREST, so answer keys are readable if any SELECT policy exists. | RLS on with **no policies** (deny-all), or disable the Data API. Move 🔒 columns to an `item_secrets` table. Authorize in app code. |
| 4 | **Pipeline not actually idempotent**: no step-state table; AssemblyAI resubmit creates duplicate jobs; the webhook has no real auth; 20-min sleep then one poll; double `/process` race; segment IDs collide across users. | Add a `pipeline_steps` table. Save `stt_job_id` before submitting. **Replace the webhook with a poll loop.** Conditional `UPDATE … RETURNING` for status. Segment PK `(lecture_id, idx)`. `FatalError` on validation failures. |
| 5 | **Grading races**: double-submit, double diagnostic answers, turn-budget race, mastery recompute race; `assisted` can't be set on append-only evidence. | State-guarded transitions (`WHERE status='active' RETURNING`); `diagnostic_responses` table with PK `(session_id,item_id)`; unique attempts; compute mastery on read (drop the cache and the evidence table). |
| 6 | **Cost cap leaks**: per-user quotas still let ~15 bots drain $45; transcript upload, client-declared duration, re-runs and retries are unbounded. | A global spend governor on `llm_calls` with a reserved pool for the judge path; Turnstile P0; Storage size limits per tier; token caps on text inputs; count re-runs; separate dev/prod budgets. |
| 7 | **"Record 2 minutes" fails its own rules** (needs 10–20 nodes, 5–8 items) and won't finish in 90 s. | Scale node/item counts by transcript length; mark ready after the map; set realistic latency targets. |
| 8 | **Doc contradictions**: diagnostic answer body, `/conversations` vs `/activities`, turn budget 6 vs 8, token caps, `?from=` names, `/health` path, Kimi route, cost numbers. | One consistency pass. |
| 9 | **Recording ethics missing**: consent, classmates' voices sent to third parties, retention. | Consent prompt before first recording, delete audio after transcription, README data statement, transcript upload as the policy-safe path. |
| 10 | **Name collision** with two same-category apps. | Rename now; keep "Lectio" as codename. |

## Other notable findings

- **Mastery rule contradicts the spec**: "unsure" correct currently counts toward green. Require 2 *independent* passes in different types, ≥1 non-MCQ; a confident miss needs 2 items before it's labeled.
- **Rubric reveal (F4c.9) conflicts with Socratic retry (F5)**; there's no resubmit endpoint. Reveal criterion labels only; allow `try_no`.
- **Spot-the-flaw verdict and location can be scored in code** (`hasFlaw`, `flawSentenceIdx`); only the correction needs the LLM judge.
- **Judge has no fallback** on a days-old model during judging: keep a pinned fallback and record `judge_model` per attempt.
- **`maxOutputTokens` includes reasoning tokens**: caps (judge 800) can truncate output at medium effort.
- **On-demand items via 202 + idempotency replay never resolves**: block 10–20 s, or return a job ID.
- **Hobby cron is daily**, so the cron fallback runner in ADR-002 is not viable.
- **Library gotchas**: workflow functions are sandboxed (import only steps); Anthropic caching needs explicit `cacheControl`; Next 16 uses `proxy.ts`; use `getClaims()`; MediaRecorder chunks only valid within one recorder session; raise the anonymous sign-in limit (30/h/IP) for judges on one network.
- **Competition overclaims**: PeerWise already does student-authored questions; error-finding is established pedagogy. Say "first in AI lecture tools", not "new".
- **Simplifications suggested** (≈2–3 days saved): drop ports/lint layering, generic idempotency store, `If-Match`, `/admin/quality`, linker, Kimi/Featherless, `JUDGE_RUNS=3`, email upgrade, server ELK cache; smaller evals (15–20 × 3).

## Where reviewers disagree with decisions you made

- **Jev**: both engineering reviewers suggest regex + one GPT-6 Luna check for the MVP, adding Jev only if time allows (experimental API; the author doesn't know the flaw anyway; adversarial threshold tuning won't happen in time). Your call — you chose Jev to try it.
- **Ports/adapters layering**: reviewers call it ceremony for 6 days; suggest one seam (`run-task.ts` with a fake mode).

## Open questions for you (from the PM)

1. Allow judges to mark the sample lecture (Demo mode), overriding the replay ban?
2. New name — can you lock it today?
3. If only one activity works end to end: spot the flaw or teach-back?
4. Any evidence from real students that "I'm lost" gets tapped in a real lecture?
5. Consent and retention stance for recordings?

---

## Full reports

### 1. Senior Product Manager

**Verdict:** Strong, well-chosen angle (markers → confidence diagnosis → reasoning practice → two-way mastery), honest competition doc. But the spec isn't buildable solo in 6 days, and the judge's demo path (F7 samples) strips out the personal markers that are the differentiator.

**Scorecard (spec as written):** Real-World Impact 3 (+1: cite Dunlosky 2013, calibration research, 3–5 student quotes, narrow to CS OS/DB undergrads) · Tech & AI Use 4 (+1: publish measured rejection/agreement/leak rates) · Innovation 4 (+1: judge personally caught by a confident mistake) · Execution 2 (+1: cut list, every visible button works, gray out unbuilt) · Presentation 3 (+1: 90 s script, works/partial/not-built table, rename).

**Scope table:** Keep F1.1–F1.4 (L/I disabled while typing) · Demote F1.5/F1.6 to P1 · Demote F1.7–F1.9 to slides-PDF text + plain transcript edit · F1.10 warning only · Cut F1.11/F1.12 → Demo mode · Keep F2.1–F2.4 · F2.5–F2.7 for seeded course only · Keep F3 (precompute) · F4a text-only, one persona · Demote F4b · F4c hero, 2-step hints, cut F4c.8 · F4d P1 "beta" · Keep F5 · F6 keep, cut streak · F7 build on day 2.

**60–90 s judge path:** "Try OS Lecture 4" → tap L twice on a 2-min clip → map with flags → 4 confidence questions → "Confident mistake: page faults" card with transcript link → one spot-the-flaw round → node red → amber → teach-back → green.

**Other findings:** undefined edge cases (no markers, off-topic markers, admin lecture with < 10 concepts, < 5 verified items, skipped confidence — add "no idea"); F1.8 re-processing undefined; F4a.5/F4b.2 lack grader specs; F4c.1 needs a no-flaw ratio and N/A fields; F4c.7 not testable as written; show per-question feedback immediately (hypercorrection effect); color-blind accessibility and list view; state iPad is out of scope; F4d "points" contradicts F6.4; spec says "settled" while name and tagline are open.

### 2. Senior System Design Engineer

**Verdict:** Thoughtful system sized for a team. Several headline safety properties don't hold (RLS, quotas, idempotency), and the 2-min path fails its own validation. **Risk: HIGH.** ~6 must-fixes; ~2–3 days of cuttable scope.

**Critical:** (1) RLS bypassed / PostgREST exposes 🔒 columns; (2) quotas don't cap spend, inputs unbounded; (3) 2-min path fails 10–20-node / 5–8-item rules and the 90 s NFR; (4) pipeline not idempotent (no step table, duplicate STT jobs, 20-min sleep, `/process` race, `?from=` cleanup, colliding segment IDs) → poll loop instead of webhook; (5) grading/evidence races; (6) on-demand generation has no executor, demo under-warmed, items reusable after rubric reveal.

**Major:** reasoning tokens count against `maxOutputTokens`; judge needs a pinned fallback, and spot-the-flaw verdict/location should be computed in code; leak guard over-engineered (frequent deflections, P95 > 4 s on regenerate); F4c.9 vs F5 conflict; unsure-correct counts toward green; `audio/webm`-only bucket blocks phone uploads; delete cascade underspecified; 60-min ≤ 6 min unrealistic (~9–10 min); Hobby cron daily; shared dev/prod budget; anonymous sign-in on first visit creates bot users; IDOR checks unspecified.

**Simplifications:** poll loop (0.5 d); regex + one cheap LLM guard instead of Jev + Luna (0.5–1 d); drop lint layering / Clock-IdGen ports / fallback runner (0.5 d); drop generic idempotency store and `If-Match` (0.5 d); drop admin page, linker, Kimi/Featherless, `JUDGE_RUNS` (0.5 d); drop email upgrade, PiP, streak, tiers, audio stitching (0.5 d); client dagre instead of server ELK cache (0.25 d); evals 15 × 3.

**Minor:** pass persona questions to the judge (stripped of style); `getClaims()`; postgres.js `max` 1–3; re-base marker time on chunk count after sleep; cap assets per lecture; one processing lecture per course; define whose markers drive the demo diagnostic; purge stale anonymous users.

### 3. Senior Software Engineer

**Verdict:** Excellent quality guardrails; scoped for three people over a month. Real risks: diagnostic contract, missing pipeline state, webhook/retry semantics that don't match the Workflow SDK, and delete cascades vs append-only evidence. Cut ports, Jev, the idempotency table, `If-Match`, the admin page; build transcript upload before audio.

**Blocking:** (1) diagnostic contract mismatch + double counting → `diagnostic_responses`; (2) no step-state table; workflow steps retry 3× by default → per-item progress, `FatalError`, return IDs not transcripts; (3) webhook token is the only auth → verify in the workflow, poll to terminal, `getConflict()`, poll-only locally; (4) re-runs and deletes break FKs from user data → add-only re-runs, `retired` items; (5) 202 + idempotency replay never resolves; (6) RLS deny-all; (7) teach-back retry impossible → `try_no`; (8) cron fallback impossible on Hobby.

**API:** client-generated UUIDv7 + `ON CONFLICT DO NOTHING` instead of a key store; drop `If-Match`; unify submissions under `/activities/{id}/submit`; adapt to `useChat` transport; fix the 429 envelope; add `GET /diagnostic/{sid}` and `GET /lectures/{id}/assets`; cut admin, `/me/progress`, pagination.

**Data model:** generate UUIDv7 in app (PG 17 has none); segment PK `(lecture_id, idx)`; drop `evidence` and `concept_mastery` (derive on read); snapshot rubric on the conversation; remove `stump` from `conversations.kind`; `ON DELETE SET NULL` on `first_lecture_id`; add indexes on FKs; add `pipeline_steps`, `items.status='retired'`, `attempts.try_no`; lazy profile upsert; qualify `usage_counters.count + 1`; `layout_hash` for map layout.

**Repo structure:** `src/app` (thin routes), `src/server/{db,auth,http,lectures,diagnostic,practice,concepts,pipeline,ai,stt}`, `src/domain` (pure), `src/client/recorder`, `scripts/{seed-demo,eval-items,eval-judge}`. One seam: `run-task.ts` with `AI_FAKE=1`.

**Suggested 6-day order:** D1 setup + Workflow/AssemblyAI spike + structured-output smoke per role · D2 transcript → concepts → map · D3 items + diagnostic + mastery + Opus demo build · D4 teach-back, recommender, spot the flaw · D5 recorder, audio/STT, marker alignment, transfer/Stump if time · D6 quotas, degraded mode, Playwright, evals, README; Oct 10 buffer.
