# Spec compliance matrix (pre-submission audit)

Date: 2026-10-05. Scope: every Must/Should F-requirement in `docs/Lectheo Product Spec.md`.
Method: read-only review of the code, seed fixtures, vitest and Playwright tests. Every status
below was checked against the source, not taken from comments. The full Playwright suite
(`apps/web/e2e/*.spec.ts`, AI_FAKE=1) and `pnpm check` were run green on this branch afterwards. Feature flags:
`apps/web/src/lib/features.ts:8-20` (UI) and `apps/web/src/server/features.ts:8` (server) are
all `true`. No flag is off, so nothing is hidden by a flag. Record live (F1.8 / mode C) has **no
flag**. It is hidden because it has no entry point (no "live" tab) and the server answers 404.

Status key: **implemented**: every clause is met. **partial**: at least one clause is not met
(the gap is stated). **documented deviation**: a deliberate, recorded departure, not a gap. **missing**: not built (Should items only, none of them shown in the UI).
**deferred**: hidden on purpose (Spec §3).

**Summary: 64 implemented · 4 partial · 2 documented deviations · 4 missing · 2 deferred (76
rows).** All 4 partial rows are Musts. F0.2, F0.6, F2.4, F5.1 and F5.2 were fixed in the last fix pass (2026-10-06). All 4 missing rows are Shoulds. No Must is missing outright.

## F0. Accounts, sample account and dashboard

| ID | Priority | Status | Evidence | Notes |
|---|---|---|---|---|
| F0.1 | Must | implemented | `apps/web/src/components/sign-in/sign-in-actions.tsx:52`, `:152`, `:174`; `apps/web/src/app/page.tsx:64` | Google + "Explore with a sample account". |
| F0.2 | Must | implemented | `apps/web/src/app/api/v1/session/sample/route.ts`; `apps/web/src/server/turnstile.ts:18`; `apps/web/src/server/sample.ts:23-34`; `apps/web/src/proxy.ts` (`redirectTarget`); `packages/db/src/__tests__/clone-sample.test.ts:88`; e2e `sign-in.spec.ts` | Every visitor gets their own clone, and the click is protected by Turnstile. **Fixed** (00d44c8): a signed-in visitor on `/` is redirected to `/dashboard`, so the landing button is only offered to signed-out visitors (a double click still returns the existing copy, by design). |
| F0.3 | Must | implemented | `packages/db/src/seed/fixtures/student-script.ts:5-13`; `packages/db/src/__tests__/seed.test.ts:422`, `:437`, `:468`; `apps/web/src/server/courses/sample-demo.test.ts:32` | L3 is 4 green and 2 amber, L4 has Pointers red (confident mistake), L5 is untouched. e2e `sample sign-in lands on a dashboard pointing at Lecture 5`. |
| F0.4 | Must | implemented | `apps/web/src/components/dashboard/dashboard-view.tsx:35`, `:94`, `:106`, `:111`; `apps/web/src/server/courses/next.ts:111` | Next-step card, lecture list with status, concept-map link, course cards. No tour or demo banner. |
| F0.5 | Must | implemented | `apps/web/src/components/account-menu.tsx:33`, `:89`, `:94`; `apps/web/src/app/api/v1/session/sample/reset/route.ts:10`; `apps/web/src/server/sample.test.ts:59` | Exact label text, plus a Reset sample step with a confirm dialog. |
| F0.6 | Must | implemented | `apps/web/vercel.json:3`; `apps/web/src/app/api/cron/daily/route.ts`; `apps/web/src/app/api/v1/session/sample/route.ts` (`purgeExpired`); `apps/web/src/server/sample.ts:46`; `apps/web/src/app/api/v1/session/sample/route.test.ts` | **Fixed** (44f4f6a): every sample sign-in also purges samples older than 24 h (after the response, best effort, errors logged); the daily cron stays as the backstop when nobody signs in. Google accounts can only be deleted by email request (`apps/web/src/app/privacy/page.tsx:85`). |
| F0.7 | Must | implemented | `apps/web/src/components/capture/new-lecture-view.tsx:88-95`; `apps/web/src/server/courses/courses.test.ts:52`, `:71`; e2e `add a lecture from a pasted transcript, see its map, delete it` | The sample limit is one personal course. Courses are created inline in `/lectures/new`. `FEATURES.createCourse` (`lib/features.ts:20`) is never read (dead flag). |

## F1. Capture with markers

| ID | Priority | Status | Evidence | Notes |
|---|---|---|---|---|
| Mode A (watch) | Must | implemented | `apps/web/src/components/lecture/watch-view.tsx:33-189`; `apps/web/src/client/capture/watch-player.tsx:33-60` | YouTube (nocookie) with an official MP3 fallback. e2e `watch Lecture 5: player, transcript, markers with undo persist after reload`. |
| Mode B (import) | Must | implemented | `apps/web/src/components/capture/import-form.tsx:31-118`; `apps/web/src/client/capture/local-player.tsx` | The file plays locally. Only the transcript is uploaded. |
| Mode C (record live) | Should | deferred | `apps/web/src/components/capture/new-lecture-view.tsx:136-149` (no live tab); `apps/web/src/server/lectures/create.ts:38` (`live` → 404); `apps/web/src/server/lectures/create.test.ts:66` | Hidden by absence, not by a feature flag. |
| Mode D (audio / transcript) | Must | implemented | `apps/web/src/components/capture/audio-form.tsx:20`; `apps/web/src/components/capture/transcript-form.tsx:26` | |
| F1.1 | Must | implemented | `apps/web/src/client/capture/use-marker-hotkeys.ts:7-41`; `apps/web/src/client/keyboard.ts:2-24`; `apps/web/src/client/capture/use-marker-hotkeys.test.tsx:70`; `apps/web/src/components/activity/spot-flaw/author-chat.test.tsx:66` | Ignored in input, textarea, select and contenteditable, and for modified or repeated keys. On-screen buttons at `watch-view.tsx:153-160`. |
| F1.2 | Must | implemented | `apps/web/src/components/lecture/watch-view.tsx:92-118` | No replay or re-mark feature exists. |
| F1.3 | Must | implemented | `apps/web/src/components/lecture/watch-view.tsx:27`, `:100-114`, `:161-163`; `apps/web/src/client/capture/marker-queue.test.ts:89`, `:100` | Counter (aria-live), a toast and a 5 s Undo. Covered by e2e watch test. |
| F1.4 | Must | implemented | `apps/web/src/client/capture/watch-player.tsx:9-14`, `:33`; `apps/web/src/components/lecture/watch-view.tsx:96` | Marker time = `player.currentMs()`. |
| F1.5 (VTT/SRT) | Must | implemented | `apps/web/src/server/lectures/transcript-upload.ts:95-121`; `apps/web/src/server/lectures/transcript-upload.test.ts:53`, `:63`; `packages/domain/src/strip-speakers.ts` | Speaker names stripped. Media is never uploaded (`import-form.tsx:95`). |
| F1.5 (DOCX) | Should | missing | `apps/web/src/server/lectures/transcript-upload.ts:148` | `.docx` is refused with "not supported yet". The UI accepts only `.vtt,.srt` (`import-form.tsx:103`). Dropped 7 Oct 2026 (one timestamp per speaker turn). |
| F1.6 | Must | implemented | `apps/web/src/components/capture/audio-form.tsx:33-51`; `packages/contracts/src/api/lectures.ts:54`; `apps/web/src/server/pipeline/transcribe.ts:236-277`; `apps/web/src/server/pipeline/pipeline.test.ts:112` | Audio is deleted after transcription. Slide vocabulary never applies because slides (F1.9) are not built. `stt.submit` is called without `keyterms` (`transcribe.ts:135`). |
| F1.7 | Must | implemented | `apps/web/src/components/capture/transcript-form.tsx:56`, `:93`; `apps/web/src/server/lectures/transcript-upload.test.ts:72` | The UI says there are no timestamps. e2e add-lecture uses paste. |
| F1.8 | Should | deferred | see Mode C | Not built. No entry point. |
| F1.9 | Should | missing | `apps/web/src/server/storage.ts:33` (path only) | No slides upload UI or API. |
| F1.10 | Should | missing | `packages/contracts/src/api/lectures.ts:92` (`PatchSegmentRequest`, no route); `apps/web/src/server/lectures/read.ts:87-119` | Edited text would be read, but no edit route or UI exists. Re-process exists (`api/v1/lectures/[id]/process/route.ts:15`). |
| F1.11 | Must | implemented | `apps/web/src/components/capture/consent.tsx:26-59`; `apps/web/src/components/capture/new-lecture-view.tsx:99`, `:134` | Checked in the client only, once per browser session. e2e add-lecture ticks it. |

## F2. Concept map

| ID | Priority | Status | Evidence | Notes |
|---|---|---|---|---|
| F2.1 | Must | implemented | `apps/web/src/server/pipeline/graph.ts:87-110` | Built from all segments. No slides input. |
| F2.2 | Must | documented deviation | `packages/domain/src/scale.ts:22-26`; `apps/web/src/server/pipeline/graph.ts:108`; `packages/ai/src/tasks/extract-concepts/validate.ts:16-26`; `packages/contracts/src/enums.ts:21-28` | The 6 relations and the pipeline's scaling are correct. Deviation: the **library** has 6 concepts per 45-min window (`packages/db/src/__tests__/seed.test.ts:107-109`, `:117-123`), where the F2.2 rule gives about 15. The curriculum is fixed on purpose: the bank's stable ids, the seed student and the e2e tests depend on it. |
| F2.3 | Must | implemented | `apps/web/src/components/course/concept-node.tsx:73`; `apps/web/src/components/course/lecture-timeline.tsx`; `apps/web/src/components/course/course-map.test.tsx:67` | Flag and star icons. Unlinked markers appear on the timeline. |
| F2.4 | Must | implemented | `packages/contracts/src/api/courses.ts` (`MapNode.sources`); `apps/web/src/server/courses/map.ts` (`loadSources`, one batched occurrences⋈segments query); `apps/web/src/components/course/node-panel.tsx` (`TaughtAt`); `apps/web/src/server/courses/courses.test.ts`; `course-map.test.tsx` | **Fixed** (d19e0c5): each node carries up to 3 source moments (timestamp + excerpt, most salient occurrence first), shown as "Where it's taught" in the node panel. Markers stay compact (no excerpt). |
| F2.5 | Must | implemented | `apps/web/src/components/course/node-panel.tsx:95-103`, `:165-173`; `packages/domain/src/recommender.ts:90-100`; `apps/web/src/server/courses/next.ts:135` | Prerequisite links are shown, and the recommender boosts prerequisites of red concepts. |
| F2.6 | Must (library) · Should (own) | implemented | `packages/db/src/__tests__/seed.test.ts:293-318`; `apps/web/src/server/pipeline/graph-check.test.ts:54` | One map per course. Cross-lecture links exist in the library. |
| F2.7 | Should | implemented | `apps/web/src/server/pipeline/graph-check.ts:6-27`; `apps/web/src/server/pipeline/graph-check.test.ts:73` | Dedupe by normalised key. |
| F2.8 | Must | implemented | `apps/web/src/components/course/concept-list.tsx:59-118`; `apps/web/src/components/course/concept-map.tsx:103-118`; `apps/web/src/components/course/course-view.tsx:43-54`, `:124-145`; `apps/web/src/components/course/course-map.test.tsx:95` | List view (state, markers, links). Tab moves through nodes, Enter opens, Esc returns focus. |
| F2.9 | Must | implemented | `packages/ai/src/tasks/extract-concepts/validate.ts:22-26`; `apps/web/src/components/lecture/lecture-view.tsx:243-250`; `apps/web/src/components/course/course-view.tsx:58-63`; `apps/web/src/components/course/concept-list.tsx:64-71`; `apps/web/src/server/pipeline/pipeline-rerun.test.ts:253` | |

## F3. Adaptive, confidence-rated diagnostic

| ID | Priority | Status | Evidence | Notes |
|---|---|---|---|---|
| F3.1 | Must | implemented | `apps/web/src/server/diagnostic/start.ts:89-103`; `packages/domain/src/scale.ts:28-31`; `packages/domain/src/diagnostic-plan.ts:38`; `apps/web/src/server/diagnostic/diagnostic.test.ts:103`, `:121` | Order is lost → important → baseline. A note is shown when there are no markers. |
| F3.2 | Must | implemented | `packages/db/src/__tests__/seed.test.ts:375-389` (a misconception per distractor) | Library is verified. Pipeline items rely on the draft prompt. |
| F3.3 | Must | implemented | `apps/web/src/server/diagnostic/start.ts:61-62` (stems only); `apps/web/src/server/diagnostic/session.ts:51-88` (only endpoint with options); `apps/web/src/server/diagnostic/answer.ts:168-170` (409 `confidence_required`); `apps/web/src/components/confidence-picker.tsx:18`; `apps/web/src/server/diagnostic/diagnostic.test.ts:157` | The server refuses options and answers until confidence is posted. "No idea" is always available. |
| F3.4 | Must | implemented | `apps/web/src/server/diagnostic/answer.ts:240-252`; `apps/web/src/components/lecture/diagnostic-view.tsx:354-373` | Verdict, why the choice is wrong, explanation and a source link. |
| F3.5 | Must | implemented | `apps/web/src/server/diagnostic/answer.ts:62-94`; `apps/web/src/server/diagnostic/diagnostic.test.ts:216`, `:254`, `:265`, `:278`; `apps/web/src/components/lecture/diagnostic-view.tsx:436` | Possible slip is shown in italics. At most 2 follow-ups. |
| F3.6 | Must | implemented | `apps/web/src/server/diagnostic/results.ts:77`; `apps/web/src/server/diagnostic/diagnostic.test.ts:286` | |
| F3.7 | Must | implemented | `apps/web/src/server/diagnostic/shared.ts:101`, `:147-153` | Verified only. "Shorter run" note when fewer than 3. |
| F3.8 | Must | implemented | `apps/web/src/server/diagnostic/answer.ts:199-219` (attempt → mastery); `apps/web/src/server/courses/next.test.ts:59` | e2e `diagnostic for Lecture 5: results per concept, confident mistake → practice`. |

## F4. Practice

| ID | Priority | Status | Evidence | Notes |
|---|---|---|---|---|
| F4c.1 | Must | implemented | `packages/contracts/src/payloads.ts:17` (3–5 sentences); `packages/ai/src/tasks/draft-items/prompt.ts:13-14`; `packages/db/src/__tests__/seed.test.ts:354` | Library ratio is tested at 20–40%. Pipeline items rely on the prompt (`prompt.ts:7` TODO few-shots). |
| F4c.2 | Must | implemented | `apps/web/src/server/pipeline/items.ts:249-315`; `packages/db/src/__tests__/seed.test.ts:320` | Blind verification by another model family. Only `verified` items are served (`server/activities/items.ts:21`). |
| F4c.3 | Must | implemented | `apps/web/src/server/activities/spot-flaw.ts:37`, `:159-213`; `apps/web/src/server/activities/core.test.ts:111`; `apps/web/src/server/activities/handlers.test.ts:105` | The author input has no answer key. Leak check, then one stricter redraft, then a canned deflection. |
| F4c.4 | Must | implemented | `apps/web/src/server/activities/spot-flaw.ts:38`, `:286-291`; `apps/web/src/server/activities/submit.ts:161-162`; `apps/web/src/server/activities/core.test.ts:142` | |
| F4c.5 | Must | implemented | `apps/web/src/components/activity/spot-flaw/answer-form.tsx`; `apps/web/src/components/activity/spot-flaw/logic.test.ts:14`, `:33` | |
| F4c.6 | Must | implemented | `packages/domain/src/scoring.ts:5-97`; `apps/web/src/server/activities/spot-flaw.ts:293-339`; `apps/web/src/server/activities/handlers.test.ts:39` | Verdict and location are checked in code. Only the correction goes to the judge. |
| F4c.7 | Must | implemented | `scripts/eval-judge.ts:1-20`; `docs/evals/judge.csv` (10 cases × 3 runs, 10/10 agree) | Small set. Labels were written by Claude, human review pending. |
| F4c.8 | Must | implemented | `apps/web/src/server/activities/submit.ts:12-18`, `:106-131`; `apps/web/src/server/activities/spot-flaw.ts:342-374`; `apps/web/src/server/activities/handlers.test.ts:52` | e2e `concept map: laid-out nodes, Pointers red, spot the flaw from the panel` (try 1 of 2). |
| F4c.9 | Must | implemented | `apps/web/src/server/activities/items.ts:17-49`; `apps/web/src/server/activities/core.test.ts:51`, `:64` | Seen = any activity or diagnostic answer. 409 `bank_empty` after 2 scenarios per concept. On-demand generation is a TODO (`items.ts:74`). |
| F4a.1 | Must | implemented | `apps/web/src/server/activities/teach-back.ts:23`; `apps/web/src/server/activities/handlers.test.ts:157` | e2e `teach-back: streamed reply from Sam, judged, retry then reveal`. |
| F4a.2 (one persona) | Must | implemented | `apps/web/src/server/activities/teach-back.ts:25-33` | "Sam, a curious first-year". |
| F4a.2 (picker) | Should | missing | `apps/web/src/server/activities/teach-back.ts:25` (ponytail) | Not built. Not shown. |
| F4a.3 | Must | implemented | `apps/web/src/server/activities/teach-back.ts:107`, `:144-161`; `apps/web/src/server/activities/handlers.test.ts:171`, `:240` | Key points are frozen in `rubric_snapshot` at start. The judge sees the friend's questions and the student's answers. |
| F4a.4 | Must | implemented | `apps/web/src/server/activities/submit.ts:164`; `apps/web/src/server/activities/handlers.test.ts:171` | |
| F4b.1 | Should | implemented | `packages/db/src/seed/fixtures/l*-items.ts` (6 transfer per lecture); `apps/web/src/server/activities/transfer.test.ts:105` | Entry point shown only while the concept has an unseen item (`node-panel.tsx:41`). |
| F4b.2 | Should | implemented | `apps/web/src/server/activities/transfer.ts:174-185`; `apps/web/src/server/activities/transfer.test.ts:136`, `:170` | e2e `transfer: map → Pointers → Transfer problem → submit twice → reveal`. |
| F4d.1 | Should | implemented | `apps/web/src/components/activity/stump/stump-view.tsx:169-240` | e2e `stump the AI: rejected, revised, accepted`. |
| F4d.2 | Should | implemented | `apps/web/src/server/activities/stump.ts:128-139`; `apps/web/src/server/activities/stump.test.ts:89`, `:164` | |
| F4d.3 | Should | implemented | `apps/web/src/server/activities/stump.ts:140-160`; `apps/web/src/server/activities/stump.test.ts:153` | |
| F4d.4 | Should | implemented | `apps/web/src/components/activity/stump/stump-view.tsx:138-146`, `:205`; `packages/domain/src/mastery.test.ts:78` | "Beta" badge only on the activity page. The node-panel button (`node-panel.tsx:20`) has no beta label. |

## F5. Socratic feedback

| ID | Priority | Status | Evidence | Notes |
|---|---|---|---|---|
| F5.1 | Must | implemented | `apps/web/src/server/activities/submit.ts:120-124`, `:161-162`; `apps/web/src/server/activities/teach-back.ts` (`retryHintFor`); `apps/web/src/server/activities/transfer.ts`; `transfer.test.ts` | Teach-back and transfer: guiding question → hint → reveal. Spot the flaw: guiding question, with hints from the on-demand ladder. **Fixed** (ddca049): transfer try 1 returns a count-only hint ("Your answer still misses n key points out of m"), never criterion content; like teach-back's, it does not mark the attempt assisted. |
| F5.2 | Must | implemented | `apps/web/src/components/activity/spot-flaw/result-panel.tsx:96`, `hint-ladder.tsx`; `apps/web/src/components/activity/teach-back/teach-back-result.tsx:36-46`; `apps/web/src/components/activity/transfer/transfer-view.tsx`; `apps/web/src/components/lecture/diagnostic-view.tsx`; `packages/contracts/src/api/activities.ts` (`HintResponse.sources`); `handlers.test.ts` | Submit, explanation and **hint** feedback carry sources. **Fixed** (eb72b09). |
| F5.3 | Must | implemented | `apps/web/src/server/activities/submit.ts:120-124`; `apps/web/src/server/activities/spot-flaw.ts:322-327`; `apps/web/src/server/activities/spot-flaw.test.ts:48`, `:70`; `apps/web/src/server/activities/transfer.test.ts:181`, `:263` | Guiding questions that would leak the answer are blocked. |

## F6. Mastery map

| ID | Priority | Status | Evidence | Notes |
|---|---|---|---|---|
| F6 state rules | Must | implemented | `packages/domain/src/mastery.ts:55-162`; `packages/domain/src/mastery.test.ts:29-154`; `apps/web/src/server/mastery.test.ts:20`, `:77` | Gray, red (latest wrong or unresolved confident mistake), amber, green (2 independent types, one of them not MCQ, nothing wrong since). Computed on read. |
| F6.1 | Must | implemented | `apps/web/src/components/mastery-badge.tsx:18-52`; `apps/web/src/components/course/concept-node.tsx:79-90`; `packages/domain/src/mastery.ts:156` | Icon, label and a tooltip ("Correct in Diagnostic and Spot the flaw"). |
| F6.2 | Must | implemented | `packages/domain/src/mastery.ts:33`, `:155`; `packages/domain/src/mastery.test.ts:46`; `apps/web/src/server/activities/stump.test.ts:119` | |
| F6.3 | Must | implemented | `apps/web/src/components/activity/stump/stump-view.tsx:169-171`; `apps/web/src/app/page.tsx:99` | No XP, streaks, badges or leaderboards. Rubric scores (e.g. 5/6) are shown, as F4c.6 requires. |

## F7. CS50 lecture library

| ID | Priority | Status | Evidence | Notes |
|---|---|---|---|---|
| F7.1 | Must | documented deviation | `packages/db/src/seed/fixtures/l3-lecture.ts:4`, `l4-lecture.ts:4`, `l5-lecture.ts:4-8`; `packages/db/src/seed/library.ts:42` | L3/L4/L5 have 45-min core windows built from the official SRT. Deviation: **slides are not used** (nothing in `scripts/seed-library.ts` or `scripts/lib/*` reads slides). Slides input is a Should in the spec's own decision log (§10), so subtitles only is deliberate. |
| F7.2 | Must | implemented | `packages/db/src/seed/fixtures/edges.ts`; `packages/db/src/__tests__/seed.test.ts:293-318` | Arrays → pointers → linked lists → hash tables. |
| F7.3 | Must | implemented | `packages/db/src/__tests__/seed.test.ts:320-339`, `:391-410`; `packages/db/src/seed/fixtures/bank-report.ts:9` (`BANK_SHORTFALL = []`); `packages/db/src/seed/fixtures/l5-items.ts:1173`, `:1237`, `:1277` | Counted: 18 concepts, each with 2 MCQs, 2 flaw scenarios and 1 transfer (12/12/6 per lecture file). Teach-back rubric = `keyPoints` (≥ 3). The L5 "hash table lookup always O(1)" misconception appears in 2 MCQ distractors and 1 flawed scenario. |
| F7.4 | Must | partial | `apps/web/src/components/license-notice.tsx:6-20`; rendered at `apps/web/src/components/dashboard/dashboard-view.tsx:131`, `apps/web/src/components/course/course-view.tsx:157`, `apps/web/src/components/lecture/lecture-view.tsx:413`, `apps/web/src/components/lecture/lecture-frame.tsx:49` (watch + diagnostic) | Text matches the spec exactly. Gap: **activity pages** for library concepts (`apps/web/src/components/activity/activity-view.tsx:39-65`) do not render it, and they show generated library content. |

## F8. Trust, privacy and limits

| ID | Priority | Status | Evidence | Notes |
|---|---|---|---|---|
| F8.1 | Must | implemented | see F1.11 | |
| F8.2 | Must | implemented | `apps/web/src/server/lectures/write.ts:43`; `apps/web/src/server/lectures/lectures.test.ts:89`, `:101`; `apps/web/src/server/pipeline/pipeline.test.ts:112` | e2e add-lecture deletes the lecture. |
| F8.3 | Must | partial | `apps/web/src/server/quota.ts:14-22`, `:59-65` (`resetAt`); `apps/web/src/components/capture/upload.ts:235-246`; `apps/web/src/server/lectures/create.test.ts:82`, `:112` | Limits match the spec. Capture errors show the reset time. Gap: the **activities and llm_tasks** quota errors show no reset time (`apps/web/src/client/practice.ts:22`, `apps/web/src/components/error-state.tsx:20-37` ignore `details.resetAt`). |
| F8.4 | Must | partial | `apps/web/src/server/ai-hooks.ts:37-40`; `apps/web/src/server/quota.ts:100-140`; `apps/web/src/components/error-state.tsx:29-31`; `apps/web/src/server/quota.test.ts:78` | At `intake_paused`, new processing stops and practice keeps working. Gap: no proactive banner (`aiPaused` is returned only by `api/v1/health/route.ts:16`, which no client reads). At `ai_paused` (95%), prepared-item practice that needs the LLM (author chat, correction judge, teach-back) fails, and only the map and diagnostic work. |
| F8.5 | Must | implemented | `README.md` (Data and privacy) | **Fixed**: "What we store" table (data, table, retention) and "Who receives data" table, now including Cloudflare Turnstile, YouTube and Vercel. |

## Gaps (Must partial/missing)

| Requirement | Exact gap | Owning file(s) | Suggested fix |
|---|---|---|---|
| F7.4 | No license notice on activity pages for library concepts | `apps/web/src/components/activity/activity-view.tsx:39-65` | Render `<LicenseNotice />` when the activity's lecture/course is the library Needs `courseId` + `courseKind` on `ActivityResponse` (contract first); the same field unblocks the "back to the map" link (judge-walkthrough fix #2). |
| F8.3 | Activities and llm_tasks quota errors omit the reset time | `apps/web/src/client/practice.ts:22`; `apps/web/src/components/error-state.tsx:20-37` | Move `limitMessage` from `components/capture/upload.ts:235` into `errorMessage` so every `quota_exceeded` shows "resets …". |
| F8.4 | No "AI paused" banner. At `ai_paused`, LLM-graded practice on prepared items fails | `apps/web/src/server/ai-hooks.ts:39`; `apps/web/src/app/api/v1/health/route.ts:16`; `apps/web/src/components/app-shell.tsx` | Expose the flags via `/me` or `/health` and show a banner in `app-shell`. Optionally let the judge degrade to code-only checks when paused. |
| F8.5 | README does not state what is stored, or list Turnstile / YouTube | `README.md:59-67` | Add a "What we store" list (tables and retention) and the missing processors. **Fixed** (README tables). |
