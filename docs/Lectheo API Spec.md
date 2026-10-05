---
title: Lectheo API Specification
updated: 2026-10-06
version: v2.1 (as built)
tags: [lectheo, architecture, api]
related: ["[[Lectheo Architecture]]", "[[Lectheo Data Model]]", "[[Lectheo Tech Stack]]", "[[Lectheo Product Spec]]", "[[Lectheo Design System]]"]
---

# Lectheo API Specification (v1 routes, doc v2)

Part of the architecture set: [[Lectheo Architecture]] · **API Spec** · [[Lectheo Data Model]] · [[Lectheo Tech Stack]]

**Changed from v1:**
- All practice activities go through one `/activities` resource.
- The diagnostic contract is fixed: confidence first, then answer, each once.
- New: session endpoints for Google and sample accounts, plus capture endpoints for watch mode and import.
- Removed: the `Idempotency-Key` store, `If-Match`, the admin page, `/me/progress`, pagination, and the transcription webhook.

**As built (6 Oct 2026):** `packages/contracts` is the executable form of this spec; where they differ, the contracts win. Added since v2: `GET /me`, the cron route, map-node `moments` and `sources`, transfer and Stump as working types, and a per-IP limit on sample sign-in. Routes marked *not built* are Should items that were cut.

---

## 1. Conventions

| Topic | Rule |
|---|---|
| Base path | `/api/v1` (health included: `/api/v1/health`). |
| Format | JSON, `camelCase`. Times within a lecture are integer media-time `…Ms`; other timestamps are ISO-8601 UTC. |
| Auth | Supabase session cookie (`@supabase/ssr`), refreshed in `proxy.ts`. Handlers verify the JWT locally with `getClaims()`. Every route needs a user (Google or sample) except `GET /health`, `GET /auth/callback` and `POST /session/sample`. |
| Validation | Zod on every body, query and path param. Every response goes through an **explicit response schema** (allow-list), and a contract test asserts no 🔒 field ever appears. |
| Safe retries | **No idempotency-key store.** Creating requests carry a **client-generated UUIDv7 `id`**, and the server does `INSERT … ON CONFLICT (id) DO NOTHING RETURNING`, then returns the existing row. State changes are **guarded updates** (`… WHERE status = 'active' RETURNING`). A second call gets `409 invalid_state` or the same result. |
| Streaming | Teach-back replies use the AI SDK **UI message stream** (SSE). The client uses `useChat` with `prepareSendMessagesRequest`, sending only the newest message. |
| Authorization | Every handler checks ownership in code. Library content is readable by all and writable by none. *(decided 6 Oct 2026, to be built)*: readable by sample (and owner) accounts only; for Google accounts it won't exist (404), so they get a fresh start ([[Lectheo Product Spec#F0. Accounts, sample account and dashboard — Must|F0.7]]). Any ID belonging to another user returns **404** (no existence leak). Writes to library or other users' resources return **404**; `403` is used only for `sample_account_restricted`. |
| Limits | 429 uses the standard envelope with `details.resetAt`. |

### Error envelope

```json
{
  "error": {
    "code": "quota_exceeded",
    "message": "You've used today's lecture limit for sample accounts.",
    "details": { "metric": "lectures", "resetAt": "2026-10-05T00:00:00Z" },
    "requestId": "req_01J…"
  }
}
```

| HTTP | Codes |
|---|---|
| 400 | `validation_failed` |
| 401 | `unauthenticated` |
| 403 | `sample_account_restricted` (e.g. a 25-min upload on a sample account) |
| 404 | `not_found` |
| 409 | `invalid_state` (answer before confidence, submit when closed, turn budget used), `already_processing` |
| 413 | `payload_too_large` |
| 422 | `unprocessable_input` (unreadable transcript, too few concepts) |
| 429 | `quota_exceeded`, `rate_limited` |
| 500 | `internal_error` (generic message; details only in server logs, with SQL parameters stripped) |
| 503 | `ai_paused` (budget governor), `intake_paused`, `upstream_unavailable` |

---

## 2. Resource overview

```
/auth/callback                           (Google OAuth return, outside /api)
/api/v1
  /session/sample          POST           start sample account
  /session/sample/reset    POST
  /session/sign-out        POST
  /me                      GET            account menu (kind, display name, isSample)
  /me                      DELETE         delete account, Google only  (to be built)
  /courses                 GET POST
  /courses/{id}            PATCH DELETE   rename, delete own course   (to be built)
  /courses/{id}/map        GET            map + mastery + markers
  /courses/{id}/next       GET            recommender
  /lectures                POST           (body has courseId)
  /lectures/{id}           GET PATCH DELETE
  /lectures/{id}/audio-upload-url   POST
  /lectures/{id}/transcript         POST GET
  /lectures/{id}/transcript/segments/{idx}  PATCH   (Should, not built)
  /lectures/{id}/slides-upload-url  POST           (Should, not built)
  /lectures/{id}/process            POST
  /lectures/{id}/markers            GET POST
  /lectures/{id}/markers/{markerId} DELETE        (undo)
  /lectures/{id}/diagnostic         POST
  /diagnostic/{sid}                 GET
  /diagnostic/{sid}/items/{itemId}/confidence  POST
  /diagnostic/{sid}/items/{itemId}/answer      POST
  /diagnostic/{sid}/results         GET
  /activities              POST
  /activities/{id}         GET
  /activities/{id}/messages     POST
  /activities/{id}/hints        POST
  /activities/{id}/submit       POST
  /activities/{id}/explanation  POST
  /health                  GET
/api/cron/daily            GET            Vercel cron (Bearer CRON_SECRET)
```

---

## 3. Sessions

### `GET /auth/callback`
Supabase Google OAuth callback. It exchanges the code, upserts `profiles(kind='google')` and redirects to `/dashboard`.

### `POST /session/sample`
Body: `{ turnstileToken }`. Verifies Turnstile, then (server-side) `signInAnonymously()` sets the session cookie. Runs `clone_sample(seed, newUser)` in one transaction and creates `profiles(kind='sample')`.
→ `200 { redirect: "/dashboard" }` · `400` bad token · `429 rate_limited`.
Sign-in happens **only on click**, never on page load, so bots and link previews don't create users.
**Per-IP limit first:** 5 sign-ins per IP per 10 minutes (`rate_limits` table). Supabase's own anonymous limit sees Vercel's egress IPs, so it is effectively global and can't do this. After the response, the route purges expired sample accounts and stale rate-limit windows (best effort, logged on failure).

### `POST /session/sample/reset`
Sample accounts only. Deletes the user's per-user rows and clones again. → `200 { redirect: "/dashboard" }`

### `POST /session/sign-out` → `204`

### `GET /me`
`200 { id, kind: "google"|"sample"|"owner", displayName, isSample }`. Drives the account menu (sample label and Reset sample).

### `DELETE /me` (Google accounts; to be built)
Deletes the account: every course the user owns (cascading to lectures, segments, markers, concepts, items, sessions, activities, attempts), their Storage objects, usage counters, the profile and finally the auth user. Then signs out. → `204`. Sample accounts → `403 sample_account_restricted` (they use Reset and expire after 24 h). Idempotent: a retry after partial failure finishes the job.

---

## 4. Courses

### `GET /courses`
`200 { data: [{ id, title, kind: "library"|"personal", attribution?, lectureCount, mastery: {gray, red, amber, green} }] }`
As built: library courses first, then the user's own, each in creation order (`kind, createdAt`), for every account. *(decided 6 Oct 2026, to be built)*: Google accounts get their own courses only, most recently active first; an empty list means first run ([[Lectheo Product Spec#F0. Accounts, sample account and dashboard — Must|F0.8]]).

### `POST /courses`
`{ id, title(1..120) }` → `201 course`. Sample accounts can create **one** personal course (a second gets `403 sample_account_restricted`). Library courses are read-only, and exist only for sample accounts.

### `PATCH /courses/{courseId}` (to be built)
`{ title(1..120) }` → `200 course`. Own courses only; library → `404`.

### `DELETE /courses/{courseId}` (to be built)
`204`. Own courses only; library → `404`. Cascades to every lecture in the course (as `DELETE /lectures/{id}`), then removes the course's Storage objects. Refused with `409 already_processing` while one of its lectures is processing.

### `GET /courses/{courseId}/map`
Joins concepts, edges, layout, this user's markers and **mastery computed on read**.

```json
{
  "course": { "id": "…", "title": "CS50x 2026", "kind": "library",
              "attribution": { "text": "CS50x 2026 by Harvard University, CC BY-NC-SA 4.0. Adapted by Lectheo.", "url": "https://cs50.harvard.edu/x/license/" } },
  "lectures": [{ "id": "…", "title": "Lecture 5 · Data Structures", "seq": 5, "status": "ready", "hasTimestamps": true }],
  "nodes": [{
    "id": "c_…", "name": "Hash tables", "summary": "…", "lectureIds": ["…"],
    "mastery": { "state": "red", "confidentMistake": true, "reasons": ["Sure and wrong in Diagnostic (twice)"] },
    "markers": { "lost": 1, "important": 0 },
    "moments": [{ "id": "m_…", "lectureId": "…", "kind": "lost", "tMs": 1834000 }],
    "sources": [{ "lectureId": "…", "idx": 42, "startMs": 1812000, "excerpt": "…" }],
    "position": { "x": 120, "y": 340 },
    "transferAvailable": true
  }],
  "edges": [{ "id": "e_…", "from": "c_…", "to": "c_…", "relation": "depends_on" }],
  "unlinkedMarkers": [{ "id": "m_…", "lectureId": "…", "kind": "lost", "tMs": 1834000 }]
}
```

`moments` are this user's markers on the concept ("▶ 12:41" links). `sources` are where the lecture teaches it ([[Lectheo Product Spec#F2. Concept map — Must|F2.4]]): up to 3, most salient first. `position` is `null` before the layout exists.

### `GET /courses/{courseId}/next`
**As built:** `200 { kind: "watch"|"diagnostic"|"activity"|"none", lectureId?, conceptId?, conceptName?, activityType?, reason }` (`packages/contracts/src/api/courses.ts`).

**Planned, F0.9–F0.12 *(decided 6 Oct 2026, to be built)*:** `200 { kind: "processing"|"watch"|"diagnostic"|"activity"|"add_lecture", lectureId?, conceptId?, conceptName?, activityType?, reason, evidence, estimateMinutes, payoff, alsoWorthDoing }`

| Field | Meaning |
|---|---|
| `kind` | `processing`: a lecture of the student's is in the pipeline (the dashboard shows its steps). `add_lecture`: nothing left to do in the course (replaces v2's `none`). |
| `reason` | The card's headline, written for the student (see the examples below). |
| `evidence` | 0–2 items `{ kind: "marked_lost"|"marked_important"|"confident_mistake"|"wrong"|"partial", text, source?: { lectureId, tMs } }`, strongest first. Built from the student's own markers and attempts only. |
| `estimateMinutes` | Watch: the lecture's duration. Diagnostic: 3. Spot the flaw, teach-back, transfer, Stump: 5. `null` for `processing` and `add_lecture`. |
| `payoff` | One line on what finishing the step changes, or `null`. Rules in [[Lectheo Architecture#6.3 Practice recommender|Architecture §6.3]]. |
| `alsoWorthDoing` | 0–2 items `{ conceptId, conceptName, state, confidentMistake, activityType, reason }`: the next ranked concepts after the top one. Empty unless `kind = "activity"`. |

Examples:
- `{ kind: "watch", reason: "Lecture 5 is ready. Watch it and tap when you're lost.", evidence: [], estimateMinutes: 45, payoff: "Your marks decide what the diagnostic asks." }`
- `{ kind: "activity", activityType: "spot_flaw", conceptName: "Hash tables", reason: "You were sure about hash tables, but got it wrong. Let's fix that.", evidence: [{ kind: "confident_mistake", text: "Sure but wrong, twice, in the diagnostic" }, { kind: "marked_lost", text: "You marked I'm lost at 12:41 in Lecture 5", source: { lectureId: "…", tMs: 761000 } }], estimateMinutes: 5, payoff: "A correct answer here clears the confident mistake." }`

---

## 5. Capture

### `POST /lectures`
```json
{ "id": "uuid-v7", "courseId": "…", "title": "Week 6 – Trees", "source": "import" }
```
`source`: `import` | `live` | `audio` | `transcript`. `library` can't be created at runtime. *As built: `live` (the recorder, Should) is not built and returns `404`.*
→ `201 lecture { id, status: "draft" }`. A replay with the same `id` returns the existing lecture.

### `GET /lectures/{id}`
```json
{ "id": "…", "courseId": "…", "title": "…", "seq": 6, "source": "import", "status": "map_ready",
  "progress": { "step": "verifyItems", "done": 7, "total": 10 },
  "media": { "youtubeId": null, "localFileName": "week6.mp4", "durationMs": 3120000 }, "hasTimestamps": true,
  "markerCounts": { "lost": 4, "important": 3 }, "needsReprocess": false, "error": null }
```
Library media also carries `startMs`/`endMs` (the core window) and `fallbackAudioUrl` (CS50's official MP3 on the same timeline, used when the YouTube embed is blocked). Polled every 2 s while `status ∈ {processing, map_ready}`. The map is usable from `map_ready` onwards; `ready` means questions are available too.

### `PATCH /lectures/{id}`: `{ title }` → `200`
### `DELETE /lectures/{id}`: `204`. Cascades and removes Storage objects. Library lectures → `404`.

### `POST /lectures/{id}/audio-upload-url` (sources `live`, `audio`)
`{ contentType: "audio/webm"|"audio/ogg"|"audio/mpeg"|"audio/mp4"|"audio/wav", sizeBytes }`
→ `200 { uploadUrl, path, expiresAt }`. The server enforces the **per-tier size** (sample ≤ 20 MB, Google ≤ 50 MB) here, and the bucket enforces 50 MB. The client then `PUT`s straight to Storage. Duration is **measured later** (from the transcription result), never trusted from the client. Audio longer than the tier limit is truncated before any AI processing.

### `POST /lectures/{id}/transcript` (sources `import`, `transcript`)
`multipart/form-data`: one file `.vtt` | `.srt` | `.txt` (≤ 2 MB), `.docx` (Teams format; Must since 6 Oct 2026, *to be built*; until then refused with `422`), **or** JSON `{ text }`.
The server parses it, **strips speaker names**, stores segments, and sets `hasTimestamps`. Size is capped in tokens by tier (sample ≈ 20 min of speech, Google ≈ 2 h).
→ `201 { segments: n, hasTimestamps: true, durationMs }` · `422 unprocessable_input`.

### `GET /lectures/{id}/transcript?fromMs=&toMs=`
`200 { segments: [{ idx, startMs, endMs, text, edited }] }`

### `PATCH /lectures/{id}/transcript/segments/{idx}` (Should, not built)
`{ editedText }` → `200`. Sets `needsReprocess`. The contract (`PatchSegmentRequest`) exists; the route and UI don't.

### `POST /lectures/{id}/process`
Starts the ingestion workflow, or re-runs it from a step after edits.
Query: `?from=extractConcepts` (allowed: `parseTranscript`, `submitTranscription`, `extractConcepts`, `draftItems`; the same step enum as `pipeline_steps`).

The server claims the lecture with a guarded update: `UPDATE lectures SET status='processing' WHERE id=$1 AND status IN ('draft','uploading','ready','map_ready','failed') RETURNING`. Re-runs count against the `reprocess` quota.
→ `202 { status: "processing" }` · `409 already_processing` (including another lecture in the same course) · `429` · `503 intake_paused`.

### `POST /lectures/{id}/markers`
Batch upsert from watch mode or the recorder (every 10 s and on pause/stop):
```json
{ "markers": [{ "id": "uuid-v7", "kind": "lost", "tMs": 1834020, "capture": "watch" }] }
```
→ `200 { accepted: 3, duplicates: 1 }`. Max 200 per request.
For **library and already-processed** lectures, markers are linked to concepts **immediately** (deterministic alignment), so the map updates without re-processing. Lectures without timestamps → `409 invalid_state`.

### `DELETE /lectures/{id}/markers/{markerId}`
Undo (soft delete) → `204`.

### `GET /lectures/{id}/markers`
`200 { data: [{ id, kind, tMs, capture, conceptIds[] }] }`. Only the caller's markers.

---

## 6. Diagnostic

### `POST /lectures/{id}/diagnostic`
Creates, or returns the active, session for (user, lecture) from **verified** items. Items this user has already seen are excluded.
`200 { sessionId, items: [{ id, conceptId, stem, position }], maxFollowUps: 2, note? }`. Options are **not** included. `note` explains a shorter diagnostic (fewer than 3 verified items) or a general check (no markers).

### `GET /diagnostic/{sid}`
Resume: `{ sessionId, status, items: [{ id, stem, position, isFollowUp, confidence?, answered, correct? }] }`

### `POST /diagnostic/{sid}/items/{itemId}/confidence`
`{ level: "sure"|"unsure"|"guess"|"no_idea" }` → `200 { options: [{ id: "a", text: "…" }, …] }`.
The item must belong to the session (planned or follow-up), otherwise `404`. A second call returns the **same options** if the level is unchanged, or `409 invalid_state` if it differs.

### `POST /diagnostic/{sid}/items/{itemId}/answer`
`{ optionId }` → `409 invalid_state` if no confidence is recorded. The update is guarded (`WHERE option_id IS NULL`), so a retry returns the stored result.
```json
{
  "correct": false,
  "confidence": "sure",
  "finding": "possible_confident_mistake",
  "correctOptionId": "c",
  "whyYourChoiceIsWrong": "Lookup is O(1) on average, but collisions make the worst case O(n)…",
  "explanation": "…",
  "source": { "lectureId": "…", "idx": 42, "startMs": 1812000, "excerpt": "…" },
  "followUp": { "itemId": "i_…", "stem": "…" },
  "mastery": { "conceptId": "c_…", "state": "red" }
}
```
`finding`: `confident_mistake` (sure + wrong on the follow-up too), `possible_confident_mistake` (first sure + wrong; a follow-up is issued), `possible_slip` (follow-up right), `wrong`, `unsure_right`, `right`.

### `GET /diagnostic/{sid}/results`
Ordered confident mistakes → wrong → unsure-right → right:
`200 { findings: [{ itemId, conceptId, conceptName, finding, confidence, source }], summary: {…}, note?: "No flags this time — here's a general check." }`

---

## 7. Practice activities (one resource for all types)

### `POST /activities`
```json
{ "id": "uuid-v7", "conceptId": "c_…", "type": "spot_flaw" }
```
`type`: `spot_flaw` | `teach_back` | `transfer` | `stump` (beta). All four are built. `persona` is accepted for teach-back, but only one persona exists (the picker is a cut Should).
The server picks an **unseen verified item** from the bank. If none exists, it generates and verifies one **inside the request** (≈ 15–25 s; the route sets `maxDuration = 60`, and the client shows "Preparing…"). The response is always final: there is no 202 or polling.

| `type` | `201` response |
|---|---|
| `spot_flaw` | `{ id, type, concept, scenario: { sentences: ["…", "…"] }, turnBudget: 6, hintsAvailable: 2 }` |
| `teach_back` | `{ id, type, concept, persona: { key, name }, opener: "Wait, so what *is* a hash table?", turnBudget: 6 }` |
| `transfer` | `{ id, type, concept, prompt }` |
| `stump` | `{ id, type, concept, guidance }` |

### `GET /activities/{id}`
`{ id, type, concept, courseId, courseKind, status, turnsUsed, turnBudget, hintsUsed, scenario, prompt?, tries: [{ tryNo, outcome, feedback, stump? }], messages: [{ role, content, createdAt }] }`
`courseId` and `courseKind` drive the "See it on the map" link and the library license notice. `tries[].stump` repeats the student's question, their key (as `studentKey`, never `answerKey`) and the referee result, so a reload shows the last verdict.
Only `visible` messages are returned. Blocked author drafts never are.
`scenario` (spot_flaw) and `prompt` (transfer) carry the item's public payload. `transferAvailable` on map nodes is true when a verified transfer item this user hasn't seen exists (F4b entry point).

### `POST /activities/{id}/messages`
`{ text(1..2000) }`. The turn is claimed with a guarded increment, otherwise `409 invalid_state`.
- **teach_back:** `200 text/event-stream` (UI message stream). `messageMetadata` carries `{ turnsLeft }`. Persisted in `onFinish`, with `consumeStream()` so a client disconnect doesn't lose the turn.
- **spot_flaw:** `200 application/json { reply, turnsLeft }`. Not streamed, because the leak check runs first (keywords → Jev → GPT-6 Luna in the gray zone).

### `POST /activities/{id}/hints` (spot_flaw)
`200 { hint, hintsUsed, hintsLeft, sources }` (2-step ladder). `sources` point to where the lecture covers it ([[Lectheo Product Spec#F5. Socratic feedback — Must|F5.2]]). The activity is marked assisted from this point.

### `POST /activities/{id}/submit`
The body depends on `type`:
- `spot_flaw`: `{ verdict: "flawed"|"correct", flawSentenceIdx?: int, correction?: string(≤1000) }`
- `teach_back`: `{}` (grades the conversation so far)
- `transfer`: `{ answer: string(1..4000) }`
- `stump`: `{ question: string(10..1000), answerKey: string(1..2000) }`

Try 1 moves the activity to `awaiting_retry` (unless it's correct); try 2 closes it. Calling submit on a closed activity → `409`.

```json
{
  "attemptId": "…", "tryNo": 1, "final": false,
  "outcome": "partial", "score": 4, "maxScore": 6,
  "checks": { "verdict": true, "location": true },
  "criteria": [{ "id": "correction", "label": "Correction is right and complete", "score": 0, "max": 2 }],
  "feedback": { "guidingQuestion": "What happens to lookup time when many keys collide in one bucket?", "hint": "…" },
  "canRetry": true, "explanationAvailable": true,
  "sources": [{ "lectureId": "…", "idx": 51, "startMs": 2010000, "excerpt": "…" }],
  "mastery": { "conceptId": "…", "state": "amber", "reasons": ["Partial in Spot the flaw"] }
}
```
Once `final = true`, the response adds `explanation` and the `rubric` criteria (labels and descriptions).
**Stump** responses add a `stump` object: `{ valid, rejectionReason?, aiAnswer, aiStumped, refereeNotes, groundedIn: "lecture"|"course_knowledge" }`. Shown as "Accepted" / "Accepted · you stumped the AI".

### `POST /activities/{id}/explanation`
Before the final try, this reveals the explanation now ("Show me"). It sets `explanation_shown`, so later tries are `assisted`.
`200 { explanation, sources, rubric? }`. `rubric` (labels and descriptions) is included only once the activity is closed, so reopening a finished activity can show how it was graded.

---

## 8. Platform

### `GET /health` (public)
`200 { ok: true, db: "ok", aiPaused: false, intakePaused: false, version: "git-sha" }`. For uptime checks.

### `GET /api/cron/daily` (Vercel cron, `0 4 * * *`)
Requires `Authorization: Bearer CRON_SECRET` (constant-time compare). Purges sample accounts older than 24 h, then deletes their auth users (best effort). `200 { purged, authUsersDeleted }`. The query also keeps the free Supabase project from pausing.

There is no admin API. Quality and cost numbers come from SQL in Supabase Studio, and the library is built by the local script `scripts/seed-library.ts`.

---

## 9. Third-party integration contracts

### Google sign-in (Supabase Auth)
Google OAuth provider enabled in Supabase. Redirect URLs for production and Vercel previews (the integration syncs preview URLs). Scopes: `openid email profile` only.

### Sample accounts (Supabase anonymous auth)
Anonymous sign-ins enabled. Supabase's per-IP limit is **raised from the default 30/hour to ~300**: on Vercel every sign-in arrives from a few egress IPs, so that limit is effectively global. Turnstile plus the app's own per-IP limit (5 per 10 min, see `POST /session/sample`) protect the endpoint instead. Supabase's captcha stays **off**; the app verifies Turnstile itself.

### Cloudflare Turnstile
Widget on the sign-in page. The server verifies the token via `POST https://challenges.cloudflare.com/turnstile/v0/siteverify`.

### YouTube (watch mode, library only)
Embedded with the **IFrame Player API** (`youtube-nocookie.com`). The client reads `getCurrentTime()` when L or I is pressed. Video is never downloaded or re-hosted. If the embed fails, the player falls back to CS50's official MP3 (`media.fallbackAudioUrl`) in a local `<audio>` element on the same timeline.

### AssemblyAI (only for `live` and `audio` sources)

| Item | Value |
|---|---|
| Submit | `transcripts.submit({ audio_url: <signed Storage URL, 1 h>, speech_model: "universal-3-5-pro", keyterms_prompt: [...] })`, **after** `stt_job_id` is reserved in the DB (the step checks for an existing job first) |
| Wait | **Poll** `GET /v2/transcript/{id}` every 15 s (workflow `sleep`) until `completed` or `error`, max 60 min. **No webhook.** |
| Then | Fetch sentences (with timestamps) → segments. **Delete** the transcript at AssemblyAI and the audio object in Storage |
| Limits | We cap uploads at 50 MB / 2 h, and 20 MB / 20 min for sample accounts |

### Vercel AI Gateway

| Item | Value |
|---|---|
| Access | AI SDK 7 `gateway('<provider>/<model>')`. **Two API keys with separate budgets**: `dev` (development, evals, library seeding) and `prod` (deployed app) |
| Structured output | `generateText({ output: Output.object({ schema }) })`. On `NoObjectGeneratedError`, one repair try, then fail with `FatalError` (no workflow retry) |
| Decisions (Jev) | `experimental_evaluate({ model: 'typesafe-ai/jev', state, questions })` (`ai` ≥ 7.0.105), used by the leak check |
| Caching | Anthropic prompt caching set explicitly with `providerOptions.anthropic.cacheControl` on the lecture-context block (only worth it above ~1–2k tokens) |
| Models by role | `reasoner`/`persona`/`answerer`: `anthropic/claude-sonnet-5.5` · `reasoner-premium` (library seed only): `anthropic/claude-opus-5.5` · `verifier`/`judge`: `openai/gpt-6.1-sol` · `judge` fallback: `google/gemini-3.8-flash` · `vision` (Should, unused: slides not built): `google/gemini-3.8-flash` · `guard`: `typesafe-ai/jev` · `guard-escalation`: `openai/gpt-6-luna`. See [[Lectheo Tech Stack#Model routing table]] |
| Errors | 402 `quota_for_entity_exceeded` → set `ai_degraded`, return `503 ai_paused` · 429 → backoff · 5xx → 1 retry, then the role's fallback model |

### Supabase (provisioned through the Vercel Marketplace)

| Item | Value |
|---|---|
| Env vars (auto-synced) | `POSTGRES_URL` (pooled, runtime), `POSTGRES_URL_NON_POOLING` (migrations), `SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` (server only). Pull locally with `vercel env pull` |
| DB | Drizzle + postgres.js via the transaction pooler: `prepare: false`, `max: 3` per instance, module-scoped client. No session state across statements |
| Data API | **Disabled** for `public` (or `anon`/`authenticated` revoked). RLS on, no policies |
| Storage | Server `createSignedUploadUrl(path)` → browser `uploadToSignedUrl`. `createSignedUrl(path, 3600)` for AssemblyAI |

---

## 10. Example: the judge path

1. Sign-in page → Turnstile → `POST /session/sample` → dashboard.
2. `GET /courses` → `GET /courses/{cs50}/next` → "Lecture 5 is ready to watch".
3. Watch mode: `POST /lectures/{L5}/markers` (batched while watching).
4. `GET /courses/{cs50}/map` → the L5 concepts show the judge's flag.
5. `POST /lectures/{L5}/diagnostic` → for each item: `…/confidence` → `…/answer` (plus a follow-up on a sure-and-wrong answer).
6. `GET /courses/{cs50}/next` → spot the flaw on *hash tables*.
7. `POST /activities` → `…/messages` ×2 → `…/submit` (try 1) → `…/submit` (try 2).
8. `POST /activities` (teach_back) → `…/messages` ×3 (streamed) → `…/submit`.
9. `GET /courses/{cs50}/map` → node red → amber → green.

**LLM cost of this path ≈ $0.15**: author and persona chat, Jev, 3 judge calls. Everything else is pre-generated.
