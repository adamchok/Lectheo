---
title: Lectheo System Architecture
updated: 2026-10-04
version: v2 (post-review)
tags:
  - lectheo
  - architecture
  - system-design
related:
  - "[[Lectheo Tech Stack]]"
  - "[[Lectheo API Spec]]"
  - "[[Lectheo Data Model]]"
  - "[[Lectheo Product Spec]]"
  - "[[Lectheo Design Review v1]]"
---

# Lectheo System Architecture

Part of the architecture set: **Architecture** · [[Lectheo API Spec]] · [[Lectheo Data Model]] · [[Lectheo Tech Stack]]

This note explains *how* Lectheo meets [[Lectheo Product Spec]] v2. Requirement IDs ([[Lectheo Product Spec#F1. Capture with markers — Must (by mode)|F1.4]], [[Lectheo Product Spec#F4c. Spot the flaw — Must (the main activity)|F4c.6]] …) refer to that spec. v2 applies the decisions of 4 Oct 2026 and every finding from [[Lectheo Design Review v1]]; the review note has the resolution table.

---

## 1. Architectural goals

Ranked. When two goals conflict, the higher one wins.

1. **The judge path works every time.** Sign-in → sample dashboard → watch Lecture 5 → diagnostic → spot the flaw → teach-back, with no slow or fragile live steps.
2. **Correct learning content.** Nothing unverified reaches a student, grading is consistent, everything is grounded in the lecture.
3. **Bounded cost and abuse-safe** on a public URL with ≈ $50 in total.
4. **Simple enough for one developer.** One Next.js app, managed services, no infrastructure to run, no ceremony layers.
5. **Changeable where it matters.** Models are picked by role in one config file. Domain rules are pure, tested functions.

### Non-functional requirements (targets)

| Area | Target |
|---|---|
| Sign-in → dashboard (sample account) | **< 2 s** (one clone transaction) |
| Map page | **< 1.5 s** (one query, mastery computed in memory) |
| Diagnostic answer | **< 300 ms** (graded in code, no LLM) |
| Teach-back reply | First token **< 2 s** (streamed) |
| Author reply (spot the flaw) | **< 4 s P95** (Sonnet ≈ 2.5 s + Jev ≈ 0.1 s; the gray zone adds ≈ 1 s) |
| Grading (submit) | **< 8 s P95** for one judge call. Spot-flaw verdict and location are instant |
| Starting an activity | Instant from the pre-generated bank. **≤ 25 s** if generated on demand ("Preparing…") |
| Ingestion: imported transcript, 60 min | Map **≤ 3 min**, questions **≤ 8 min** |
| Ingestion: recorded or uploaded audio, 60 min | Map **≤ 6 min** (transcription 1–3 min), questions **≤ 11 min** |
| Ingestion: 20 min (sample tier) | Map **≤ 2 min**, questions **≤ 5 min** |
| Recording | Nothing lost on refresh or crash (pieces in IndexedDB). Up to 2 h |
| Judge consistency | ≥ 95% agreement over 3 repeated runs on the test set (single-run production) |
| Item validity | ≥ 95% correct on manual review of the library bank. Verifier rejection rate reported |
| Cost | Judge path ≈ **$0.15** per visitor. Global hard stops via gateway budgets and the app governor |
| Accessibility | Keyboard-only use, list view of the map, state shown by icon + label, not only color |
| Browser | Desktop Chrome (current and previous major version) |

---

## 2. System context

```mermaid
flowchart LR
    user(["Student / Judge<br/>Chrome on laptop"])
    subgraph lectheo["Lectheo on Vercel"]
        app["Next.js app<br/>UI · REST API · Workflow"]
    end
    supa[("Supabase via Vercel<br/>Postgres · Storage · Auth")]
    google["Google OAuth"]
    ts["Cloudflare Turnstile"]
    yt["YouTube embed<br/>library videos"]
    gw["Vercel AI Gateway<br/>budgets + routing"]
    anth["Anthropic<br/>Sonnet 5.5 · Opus 5.5 seed only"]
    oai["OpenAI<br/>GPT-6.1 Sol · GPT-6 Luna"]
    goog["Google<br/>Gemini 3.8 Flash"]
    jev["TypeSafe Jev"]
    aai["AssemblyAI<br/>audio sources only"]

    user -- "HTTPS JSON + SSE" --> app
    user -- "signed upload: audio, transcripts" --> supa
    user -- "plays video" --> yt
    user -- "sign in" --> google
    user -- "bot check" --> ts
    app -- "SQL via pooler · signed URLs · auth" --> supa
    app -- "verify token" --> ts
    app -- "LLM + decision calls" --> gw
    gw --> anth
    gw --> oai
    gw --> goog
    gw --> jev
    app -- "submit + poll jobs" --> aai
    aai -- "fetch audio via signed URL" --> supa
```

**Trust boundaries**
- The browser is untrusted. Student text, uploaded files and lecture content are **data, never instructions** ([[#5.4 Judge consistency and safety|§5.4]]).
- Only the server holds secrets: the Supabase secret key, two AI Gateway keys, the AssemblyAI key and the Turnstile secret.
- The Supabase Data API is **off**, and RLS is deny-all, so the browser's publishable key can only reach Auth and signed Storage URLs.
- **Imported video never leaves the student's laptop.**

---

## 3. Code organization

One Next.js app, organized by feature, with **one seam**: all AI calls go through `runTask()`, which supports a fake mode (`AI_FAKE=1`) for tests. There are no ports, adapters or lint-enforced layers. Pure rules live in `domain/` and are unit-tested.

```
src/
  app/                    pages + app/api/v1/**/route.ts (thin: auth → zod → service → response schema)
  proxy.ts                Supabase session refresh (Next 16 replaces middleware.ts)
  server/
    db/                   schema.ts, client.ts (postgres.js, prepare:false, max:3), migrations/
    auth.ts               getActor() via getClaims(); ensureProfile(); sample clone/reset
    http.ts               error envelope, zod parsing, response schemas (allow-lists)
    quota.ts              per-user counters + global spend governor
    lectures/  diagnostic/  activities/  concepts/  library/
    pipeline/             workflow.ts ('use workflow'), steps.ts ('use step')
    ai/                   models.ts (role → model), run-task.ts, tasks/<task>/{prompt,schema,task}.ts
    stt/assemblyai.ts     storage.ts   turnstile.ts
  domain/                 mastery.ts, recommender.ts, align-markers.ts, scoring.ts,
                          scale.ts, parse-vtt.ts, parse-srt.ts, strip-speakers.ts   (pure)
  client/
    capture/              watch-player (YouTube IFrame API), local-player (<video> object URL),
                          recorder (reducer, idb chunks), marker-queue
scripts/                  seed-library.ts, eval-items.ts, eval-judge.ts, eval-guard.ts
```

---

## 4. Key flows

### 4.1 Sign-in and sample account (F0)

```mermaid
sequenceDiagram
    autonumber
    actor V as Visitor
    participant UI as Sign-in page
    participant API as /api/v1
    participant TS as Turnstile
    participant DB as Postgres

    V->>UI: Explore with a sample account
    UI->>TS: invisible challenge
    TS-->>UI: token
    UI->>API: POST /session/sample {turnstileToken}
    API->>TS: siteverify(token)
    API->>API: signInAnonymously (server-side, sets cookie)
    API->>DB: BEGIN · insert profile(kind=sample) · clone_sample(seed, user) · COMMIT
    API-->>UI: {redirect: /dashboard}
    Note over V,DB: Google path: OAuth → /auth/callback → ensureProfile(kind=google) → /dashboard
```

The sample account is **lived-in**: L3 practiced (mostly green/amber), L4 with a confident mistake on *pointers*, L5 "Ready to watch". **Reset sample** deletes the per-user rows and clones again. A daily cron purges sample accounts older than 24 h.

### 4.2 Capture modes (F1)

| Mode | Media | Marker time source | What's uploaded | Pipeline entry |
|---|---|---|---|---|
| **A. Watch (library)** | YouTube IFrame embed | `player.getCurrentTime()` | markers only | none: already processed. Markers are aligned on write |
| **B. Import** | local file → `<video src=objectURL>` | `video.currentTime` | transcript file (.vtt / .srt; .docx Should) + markers | `parseTranscript` |
| **C. Live (Should)** | `MediaRecorder` (Opus codec, 32 kbps, 10 s pieces) | elapsed media time = pieces × 10 s + offset into the current piece | audio (signed URL) + markers | `transcribe` |
| **D. Upload** | audio file, or transcript / text | none (no markers) | audio or transcript | `transcribe` or `parseTranscript` |

```mermaid
sequenceDiagram
    autonumber
    actor S as Student
    participant P as Player (watch / import)
    participant Q as Marker queue (IndexedDB)
    participant API as /api/v1

    S->>P: play (first viewing)
    S->>P: press L (not typing in a field)
    P->>Q: {id: uuidv7, kind: lost, tMs: currentTime}
    P-->>S: toast "Marked: lost · Undo"
    loop every 10 s and on pause / stop
        Q->>API: POST /lectures/{id}/markers (batch, ON CONFLICT DO NOTHING)
        API->>API: if lecture processed → alignMarkers now
    end
```

**Import details (B):** the student picks the MP4 or audio file and its transcript. The file is opened with `URL.createObjectURL` and **never uploaded**. The transcript is uploaded; the server parses VTT/SRT cues into segments and **strips speaker labels** (`<v Name>` tags, "Name:" prefixes). The marker and transcript clocks are the same recording timeline, so no offset is needed.

**Live recorder (C, slim):**
- States: `idle → requesting_mic → recording ⇄ paused → stopping → uploading → submitted`, plus `recovering` and `error`.
- Each piece is stored in IndexedDB with a `recorderSession` ID. Only pieces from the **same** recorder session are joined into one valid WebM file.
- A gap in wall-clock time (sleep or a closed lid) ends the session. The next recording starts a new session and becomes a separate audio file.
- The Screen Wake Lock is re-acquired on `visibilitychange`. Recording continues in a background tab.
- On reload with leftover pieces → `recovering` → "Upload what was captured".

### 4.3 Ingestion pipeline

Workflow `processLecture(lectureId, from?)`. Every step is a `'use step'` function that writes to `pipeline_steps`, skips work already done, and throws `FatalError` on validation failures (so they aren't retried; transient errors use the default retries). Steps return IDs, not large payloads.

```mermaid
flowchart TD
    start(["POST /lectures/{id}/process<br/>guarded claim → status=processing"]) --> src{"source"}
    src -- "import / transcript" --> pt["parseTranscript<br/>VTT/SRT/DOCX/TXT · strip speakers · cap tokens by tier"]
    src -- "live / audio" --> kt["buildKeyterms<br/>from slides (Should)"]
    kt --> sub["submitTranscription<br/>reserve stt_job_id first · reuse if set"]
    sub --> poll["pollTranscription<br/>sleep 15 s → GET status · loop to terminal · max 60 min"]
    poll --> fetch["fetchTranscript<br/>sentences → truncate to tier limit · delete audio + remote transcript"]
    pt --> seg["segment<br/>sentence groups ≤ 40 s · PK (lecture, idx)"]
    fetch --> seg
    seg --> ex["extractConcepts<br/>reasoner · counts scaled to length · existing course concepts in prompt"]
    ex --> vg["validateGraph<br/>citations exist · DAG · dedupe by canonical key"]
    vg --> lay["layoutMap<br/>ELK once · store positions + layout_hash"]
    lay --> al["alignMarkers"]
    al --> mr(["status = map_ready"])
    mr --> dr["draftItems<br/>batches of 4 · per-item writes"]
    dr --> vf["verifyItems<br/>verifier blind-solves · per-item writes · ≤ 1 redraft round"]
    vf --> done(["status = ready"])
    pt -. "FatalError or retries exhausted" .-> fail(["status = failed · error shown · retry button"])
```

**Rules**
- **Claiming** uses a guarded `UPDATE … WHERE status IN (...) RETURNING`, plus a partial unique index (one processing lecture per course). That closes the double-`/process` race and the dedupe race.
- **No webhook.** Transcription completion is polled. That removes the webhook-auth gap and the local-dev callback problem.
- **Scaling ([[Lectheo Product Spec#F2. Concept map — Must|F2.2]], [[Lectheo Product Spec#F3. Adaptive, confidence-rated diagnostic — Must|F3.1]]):** `nodes = clamp(round(minutes / 3), 3, 20)`, `diagnosticItems = clamp(ceil(nodes / 2) + 1, 3, 6)`. Item drafting covers every concept: 2 MCQ variants, 1–2 flaw scenarios, plus a transfer item for the top concepts.
- **Re-run `?from=`** clears `pipeline_steps` from that step onward. New concepts are **added**, old items are marked `retired` (never deleted, because attempts reference them), and edges are recomputed. It counts against the `reprocess` quota.
- **Step time budget:** each step < 300 s. Drafting in batches of 4 keeps each call around 30–60 s.
- **Library lectures** are processed by `scripts/seed-library.ts` locally (dev key, `reasoner-premium` = Opus 5.5) and imported as data. They never run through the production pipeline.
- **If the Workflow SDK fails the day-1 spike:** fallback = the same step functions chained through route handlers with `after()`, driven by `pipeline_steps`. (Hobby cron runs only daily, so a cron-based runner isn't viable.)

### 4.4 Adaptive diagnostic (F3)

```mermaid
sequenceDiagram
    autonumber
    actor S as Student
    participant API
    participant DB

    S->>API: POST /lectures/{id}/diagnostic
    API->>DB: plan 3–6 unseen verified items: lost → important → baseline
    API-->>S: stems only
    loop each item
        S->>API: POST …/items/{item}/confidence {sure | unsure | guess | no_idea}
        API->>DB: insert diagnostic_responses (PK session,item)
        API-->>S: options
        S->>API: POST …/items/{item}/answer {optionId}
        API->>DB: guarded update WHERE option_id IS NULL · insert attempt
        alt sure AND wrong AND followUps < 2
            API-->>S: feedback + followUp item (same concept)
        else
            API-->>S: feedback + source link
        end
    end
    S->>API: GET …/results
    API-->>S: confident mistakes → wrong → unsure-right → right
```

Grading is deterministic (MCQ), so there are no LLM calls and nothing to pay for.

### 4.5 Spot the flaw (F4c), the main activity

```mermaid
sequenceDiagram
    autonumber
    actor S as Student
    participant API
    participant A as Author (Sonnet 5.5)
    participant G as Leak check (keywords → Jev → Luna)
    participant J as Judge (GPT-6.1 Sol)

    S->>API: POST /activities {type: spot_flaw, conceptId}
    API->>API: unseen verified item · rubric_snapshot from item_secrets
    API-->>S: scenario sentences · 6 questions · 2 hints
    loop up to 6 questions (guarded turn increment)
        S->>API: POST …/messages {text}
        API->>A: "You wrote this and believe it is correct" + scenario + history (no flaw info)
        A-->>API: reply (≤ 150 tokens)
        API->>G: keywords hit? → Jev p(reveals location), p(reveals correction)
        alt p > 0.7 or keyword hit
            API->>A: regenerate once (stricter)
            API->>G: re-check · if still leaking → canned deflection
        else 0.3 ≤ p ≤ 0.7
            API->>G: GPT-6 Luna yes/no
        end
        API-->>S: reply · turnsLeft
    end
    S->>API: POST …/submit {verdict, flawSentenceIdx, correction}
    API->>API: verdict + location checked in code (instant)
    API->>J: correction only · rubric_snapshot · flaw truth · scenario
    J-->>API: correction criteria (0–2) + rationale
    API-->>S: try 1: score + guiding question → retry · try 2: + explanation + rubric criteria
```

- **Scoring ([[Lectheo Product Spec#F4c. Spot the flaw — Must (the main activity)|F4c.6]]):** flawed scenario: verdict 2 + location 2 + correction 0–2 = 6. Correct scenario: verdict 2 = 2. Outcome: correct ≥ 5/6 (2/2), partial 3–4, incorrect ≤ 2. If the verdict is wrong, the judge isn't called.
- **Hints and explanation** mark later attempts `assisted`. The guiding question doesn't.
- **Leak check:**
  - Timeouts: Jev > 800 ms → Luna. Luna failure → canned deflection (fail closed).
  - Thresholds start at 0.3 / 0.7 and are tuned with `scripts/eval-guard.ts`.
  - Because the author never knows the flaw, the check only has to catch it *working the flaw out*. Expect occasional deflections; this is logged.

### 4.6 Teach-back (F4a)

The confused friend (Sonnet 5.5, low effort) is streamed for up to 6 turns. On submit, the judge sees the **friend's questions (style stripped) and the student's answers**, plus `rubric_snapshot` (the concept's key points, frozen when the activity starts). It returns per-key-point coverage (0–2) and misconceptions, and code totals them. Feedback follows the same retry pattern.

### 4.7 Stump the AI (F4d, Should)

1. Referee pass 1 (judge role): valid? on-concept? unambiguous? answerable from the lecture or standard course knowledge? is the key correct? → reject with a reason (outcome `invalid`, no mastery effect).
2. Answerer (Sonnet 5.5, never sees the key) answers.
3. Referee pass 2 compares the answer to the key → `aiStumped`.

Referee and answerer are different model families, so the referee isn't grading its own family's work.

---

## 5. AI subsystem

### 5.1 Tasks and runTask()
Each task is `ai/tasks/<name>/{prompt.ts, schema.ts, task.ts}` with a `PROMPT_VERSION`. `runTask()`:
1. **Quota and governor check** ([[#9.2 Abuse and cost|§9.2]]). Rejects with `quota_blocked` or `budget_blocked`.
2. Calls the role's model through the gateway with `Output.object({ schema })`. Schemas use `.nullable()` instead of optional fields, and counts and lengths are checked after the call (strict JSON-schema limits).
3. **Semantic validation:** citations exist, counts within the scaled range, options unique, no self-edges. On failure: **one** repair call with the error, then `FatalError`.
4. Logs `llm_calls` (tokens include reasoning, cost from gateway metadata, latency, outcome).
5. **Output-token limits allow for reasoning tokens:** extraction 16k, item batch 12k, verifier 4k, judge 4k, persona 600, guard escalation 300.

### 5.2 Prompt construction
- **Stable prefix first:** system rules → lecture context (segments as `[s42] text`) → task → variable input. Anthropic caching is enabled explicitly with `cacheControl` on the lecture block (pipeline and multi-turn chats, where the prefix is ≥ 2k tokens).
- Untrusted content goes in tagged blocks (`<transcript>`, `<student_answer>`), with the rule that text inside them is material, never instructions.
- Few-shot examples from CS50 topics, including correct "no flaw" scenarios (about 30% of the flaw bank).
- MCQ distractors must each carry `misconception` and `whyWrong` (stored in `item_secrets`).

### 5.3 Verification gate
The verifier (GPT-6.1 Sol, a different family from the Sonnet/Opus generator) receives each draft **without its key**, solves it, and checks: exactly one correct option, or exactly one flaw / no flaw as claimed, and citations that support the key. An item is `verified` only if its answer matches the key and all checks pass. At most one redraft round runs, then the remaining items are served and the shortfall is labeled. Rejection rates are reported in the README.

### 5.4 Judge consistency and safety
| Technique | Effect |
|---|---|
| Exact checks in code wherever possible (MCQ, flaw verdict and location) | Zero variance for most of the score |
| Rubric frozen before the activity (`rubric_snapshot`) | Same criteria every time, even after re-processing |
| Criterion-level 0–2 outputs, totals computed in code | Less variance than holistic scores |
| Pinned judge model and fixed effort. Fallback judge (Gemini 3.8 Flash) only on outage, recorded in `attempts.judge_model` | Drift is visible and measurable |
| `scripts/eval-judge.ts`: ~10 answers × 3 runs | Measures agreement for the README (target ≥ 95%) |
| Prompt injection ("give me full marks") | Student text is delimited, criteria are factual, verdict and location aren't the LLM's call, and there are no tools or actions |

---

## 6. Domain rules (pure functions in domain/)

### 6.1 Marker → concept alignment (F2.3)
```
window(lost)      = [tMs − 60 s, tMs + 10 s]    // confusion is felt after the explanation
window(important) = [tMs − 30 s, tMs + 15 s]
markerSegments    = segments overlapping window
concept           = argmax overlap(markerSegments, concept.occurrence segments)
                    ties → concept with most occurrences in the window
                    none → "unlinked" (shown on the lecture timeline)
```
Runs on write for processed lectures, and in the pipeline otherwise. Window sizes are tuned on the CS50 lectures.

### 6.2 Mastery
Input: the user's attempts for a concept (excluding `invalid`). *Independent* = diagnostic with confidence `sure`, or a practice attempt with `assisted = false`.

```
computeMastery(attempts):
  if none                                        → GRAY ("Not tested")
  last = latest attempt
  if last.outcome = incorrect                    → RED
  if a confident mistake exists (sure+wrong twice, or sure+wrong with no follow-up)
     and no independent correct after it         → RED (confidentMistake = true)
  strong = { a.activityType | a.outcome = correct ∧ independent(a) }
  if |strong| ≥ 2 ∧ strong ⊄ {diagnostic}        → GREEN
  if any correct or partial                      → AMBER
  else                                           → RED
```
It returns `reasons[]` for the tooltip. There's no streak and no stored cache: it's computed per request for ≤ 60 concepts.

### 6.3 Practice recommender
```
priority = 100·confidentMistake + 60·red + 40·markedLost + 25·amber
         + 10·prerequisiteOfRed − 15·practicedInLast10Min
next type = first of [spot_flaw, teach_back, transfer*, stump*] without an independent correct
            (* only when enabled)
dashboard "Next step": unwatched library lecture → pending diagnostic → top concept
```

### 6.4 Scaling and scoring
`scale.ts` (node and item counts) and `scoring.ts` (spot-flaw totals, outcome bands, Stump outcome) are unit-tested against the spec tables.

---

## 7. Frontend

| Route | Purpose |
|---|---|
| `/` | Sign-in page: Continue with Google · Explore with a sample account (Turnstile) |
| `/dashboard` | Course cards, lecture list and status, "Next step" card, account menu (sample label + Reset) |
| `/courses/[id]` | Concept map (React Flow, stored ELK layout) + list view toggle + lecture timeline with unlinked markers |
| `/lectures/new` | Add lecture: Import recording · Upload audio · Upload transcript · Record live (if enabled), with the consent checkbox |
| `/lectures/[id]/watch` | Watch mode (YouTube or local file) with L/I marking, transcript side panel |
| `/lectures/[id]/record` | Live recorder (Should) |
| `/lectures/[id]` | Processing progress (2 s polling) and transcript |
| `/lectures/[id]/diagnostic` | Confidence-first questions, instant feedback, results |
| `/activities/[id]` | Spot the flaw / Teach-back / Transfer / Stump |

- **Data fetching:** TanStack Query for fetches and polling; AI SDK `useChat` for teach-back.
- **Keyboard:** L / I are handled only when `document.activeElement` isn't an input, textarea or contenteditable.
- **Grounding links:** a shared `<SourceRef>` component renders "▶ 12:41 · excerpt". It seeks the YouTube or local player when available, and otherwise opens the transcript panel.
- **CS50 license notice** on all library pages ([[Lectheo Product Spec#F7. CS50 lecture library — Must|F7.4]]).

---

## 8. Reliability and failure modes

| Failure | Behavior |
|---|---|
| Transcription slow or failed | Polling continues until a terminal status (max 60 min) → failed, with "Upload transcript instead". Low confidence → warning + transcript edit (Should) |
| LLM transient error / 429 | Step retries (workflow defaults) or 1 retry in a request, then the role's fallback model |
| Invalid LLM output | 1 repair call → `FatalError`. Invalid data is never stored |
| Too few verified items | One redraft round, then a shorter diagnostic, labeled |
| On-demand generation is slow | Blocks up to 25 s ("Preparing…"). Rare, because the library bank is pre-generated |
| **AI budget governor trips** | `intake_paused` first (no new processing or generation), then `ai_paused` (no LLM calls). The library map, diagnostic and pre-generated items keep working. Clear banner |
| Gateway 402 (key budget hit) | Same as `ai_paused` |
| Judge model outage | Fallback judge, recorded in `attempts.judge_model` |
| Jev outage | Escalate every check to GPT-6 Luna (fail closed) |
| Supabase pausing | The daily cron hits `/api/v1/health` |
| Workflow engine problem | Fallback chain via `after()` ([[#4.3 Ingestion pipeline\|§4.3]]) |
| Recording interrupted | Recover from IndexedDB, per recorder session |
| Double clicks or retries | Client UUIDs + `ON CONFLICT`, guarded state transitions, unique `(activity, try_no)` and `(session, item)` |

---

## 9. Security, abuse and cost

### 9.1 Identity and authorization
- **Google accounts** (OAuth) and **sample accounts** (anonymous, created only by clicking the button, after Turnstile). The anonymous sign-in rate limit is raised to ~300/h per IP for judges on a shared network.
- Every handler loads the resource with an ownership join (`WHERE user_id = actor OR course.kind = 'library'` for reads; strict ownership for writes). IDs from other users → 404. Specific checks:
  - The diagnostic confidence and answer endpoints require `itemId` ∈ that session.
  - Segment and asset routes join through the lecture owner.
  - `GET /activities/{id}` returns only visible messages.
- **The database is server-only:** Data API off, RLS deny-all, secret data in `item_secrets` and 🔒 columns, allow-list response schemas, and a contract test.

### 9.2 Abuse and cost
| Layer | Control |
|---|---|
| Bots | Turnstile on the sample button. Sign-in only on click. Vercel DDoS protection |
| Per-user quotas (daily) | Lectures: sample 1 (≤ 20 min / 20 MB), Google 3 (≤ 2 h / 50 MB). Re-processing: 2. LLM tasks: 60. Activities: 30 |
| Inputs | Upload size enforced when the signed URL is created. Transcripts capped in tokens by tier. Messages ≤ 2,000 chars. 1 slides PDF ≤ 20 MB / 60 pages. Duration measured server-side and truncated to the tier limit |
| **Global spend governor** | Before each `runTask`, sum `llm_calls.cost_usd` for the **prod** key: ≥ $3 in the last hour or ≥ 75% of the prod budget → `intake_paused`. ≥ 95% → `ai_paused`. About 40% of the prod budget is kept for practice on library content, so judges keep working even if uploads are abused |
| Gateway budgets | **Separate keys:** `dev` (development, evals, seeding) and `prod` (deployment), each with its own hard budget (402). Development can't eat into the judging budget |
| Retries | `FatalError` on validation failures, and one repair call, so retries can't multiply cost |

### 9.3 Data protection
- Consent checkbox before any recording or upload.
- Uploaded audio is deleted after transcription, and remote transcripts are deleted at AssemblyAI. Imported video never leaves the device.
- Speaker names are stripped from imported transcripts.
- `DELETE /lectures/{id}` cascades to derived data and Storage. Orphaned concepts are removed.
- Sample accounts are purged after 24 h.
- Secrets live only in Vercel env vars.
- The README lists data processors: Supabase, AssemblyAI (audio only), Anthropic, OpenAI, Google, TypeSafe through Vercel AI Gateway.

---

## 10. Observability and testing

| Signal | Where |
|---|---|
| Errors and requests | Vercel logs (JSON: `requestId`, `userId`, `route`, `latencyMs`) |
| Pipeline | Workflows dashboard + `pipeline_steps` + `lectures.error` |
| LLM cost, latency, outcomes | AI Gateway logs + the `llm_calls` table, queried in Supabase Studio |
| Content quality | `scripts/eval-*.ts` write CSVs: ~20 hand-checked items, ~10 judge cases × 3 runs, ~15 adversarial author prompts for the leak check |

| Level | What | Tool |
|---|---|---|
| Unit | `domain/*`: mastery, recommender, alignment, scaling, scoring, VTT/SRT parsers, speaker stripping, recorder reducer | Vitest |
| Contract | Response schemas never include 🔒 fields. Ownership checks on every route | Vitest |
| E2E | The **judge path** in a fresh browser, with `AI_FAKE=1` for determinism. Recorder with `--use-fake-device-for-media-stream --use-file-for-fake-audio-capture` | Playwright |

---

## 11. Requirements traceability

| Spec | Where |
|---|---|
| [[Lectheo Product Spec#F0. Accounts, sample account and dashboard — Must\|F0]] accounts, sample account, dashboard | [[#4.1 Sign-in and sample account (F0)\|§4.1]], `POST /session/*`, `clone_sample`, [[#6.3 Practice recommender\|§6.3]] next step |
| [[Lectheo Product Spec#F1. Capture with markers — Must (by mode)\|F1]] capture modes | [[#4.2 Capture modes (F1)\|§4.2]], capture endpoints, pipeline entry points |
| [[Lectheo Product Spec#F2. Concept map — Must\|F2]] concept map | [[#4.3 Ingestion pipeline\|§4.3]] steps extractConcepts → layoutMap, [[#6.1 Marker → concept alignment (F2.3)\|§6.1]], map endpoint, list view |
| [[Lectheo Product Spec#F3. Adaptive, confidence-rated diagnostic — Must\|F3]] adaptive diagnostic | [[#4.4 Adaptive diagnostic (F3)\|§4.4]], `diagnostic_responses`, follow-up rule |
| [[Lectheo Product Spec#F4c. Spot the flaw — Must (the main activity)\|F4c]] spot the flaw | [[#4.5 Spot the flaw (F4c), the main activity\|§4.5]], `item_secrets`, scoring [[#6.4 Scaling and scoring\|§6.4]], leak check |
| [[Lectheo Product Spec#F4a. Teach-back — Must (supporting activity)\|F4a]] teach-back | [[#4.6 Teach-back (F4a)\|§4.6]] |
| [[Lectheo Product Spec#F4b. Transfer problem — Should\|F4b]] transfer, [[Lectheo Product Spec#F4d. Stump the AI — Should (labeled "beta")\|F4d]] Stump (Should) | [[#4.7 Stump the AI (F4d, Should)\|§4.7]], `/activities` types |
| [[Lectheo Product Spec#F5. Socratic feedback — Must\|F5]] Socratic feedback | Submit feedback shape, try_no retry, explanation endpoint |
| [[Lectheo Product Spec#F6. Mastery map — Must\|F6]] mastery | [[#6.2 Mastery\|§6.2]] (computed on read) |
| [[Lectheo Product Spec#F7. CS50 lecture library — Must\|F7]] CS50 library | `scripts/seed-library.ts`, library course kind, pre-generated bank, attribution |
| [[Lectheo Product Spec#F8. Trust, privacy and limits — Must\|F8]] trust and limits | [[#9. Security, abuse and cost\|§9]] |
| [[#8. Reliability and failure modes\|§8]] quality rules | [[#5.3 Verification gate\|§5.3]]–[[#5.4 Judge consistency and safety\|5.4]], [[Lectheo Tech Stack#ADR-009 · Information hiding by construction\|ADR-009]], [[#9.3 Data protection\|§9.3]] |

---

## 12. Technical risks

| # | Risk | Plan |
|---|---|---|
| 1 | Workflow SDK maturity | Day-1 spike on a preview deploy (a step + sleep + poll). Fallback `after()` chain |
| 2 | Days-old models (Sonnet 5.5, GPT-6.1 Sol) and the experimental Jev API | Day-1 smoke test of every role. Pinned slugs + fallbacks. Jev behind `runTask`, with the Luna escalation |
| 3 | Verifier rejects many Sonnet items | Measure on the library bank. If > 40%, switch `reasoner` to Opus 5.5 (one config line) |
| 4 | Leak check deflects too often | Tune thresholds on `eval-guard`. Log the deflection rate |
| 5 | Teams `.docx` transcript format varies | VTT/SRT first. DOCX is Should |
| 6 | Long recordings exceed 50 MB | 32 kbps Opus. 2 h cap. Suggest transcript import |
| 7 | YouTube embed blocked (school network or privacy settings) | Detect the player error and fall back to CS50's official lecture MP3 (CC-licensed, same timeline as the subtitles) in a local `<audio>` player |
| 8 | Name collision | Resolved: renamed to **Lectheo**. Register lectheo.com and the GitHub org before submission |
