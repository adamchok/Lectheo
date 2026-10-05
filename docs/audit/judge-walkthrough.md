# Judge walkthrough (pre-submission audit)

Date: 2026-10-05. A first-time judge on desktop Chrome follows the judge path in Product Spec §4.1,
from the landing page with a sample account. Measured locally against a production build
(`next start`, local Supabase, `AI_FAKE=1`). Wall-clock times come from a Playwright script that
waits for each step's visible end state (`networkidle` for page loads). The prod column comes from
the latency targets in Architecture §1 and the measured eval runs in `docs/evals/stump.csv`.
No `llm_calls` export from prod was available to this audit.

## What judges look for (Competition doc §5–6)

- Show something NotebookLM can't, **within about a minute**: personal markers and a confident
  mistake. ✅ The dashboard shows "Lecture 4 · 1 confident mistake" on the first screen, 0.5 s after
  the click.
- Lead with understanding, not retention: spot the flaw and Stump the AI. ✅ Both can be reached
  from the Pointers node in two clicks.
- Grading must be consistent, rubric-based and visible. ✅ The rubric and model solution appear
  after the final try (spot the flaw, transfer). Teach-back shows its key points. ⚠️ A reloaded
  spot-the-flaw loses its rubric (fix #4).
- Light gamification. ✅ No points, streaks or XP anywhere on the path.

## Step timings

| # | Step (Spec §4.1) | Local, AI_FAKE=1 | Real AI in prod? | Expected prod latency | Feedback while waiting |
|---|---|---|---|---|---|
| 1 | Landing page load | 0.7 s | no | ≈ 1 s (static page; Turnstile script from Cloudflare) | — |
| 2 | "Explore with a sample account" → dashboard | 0.4–0.6 s | no (Turnstile verify + `clone_sample`) | < 2 s target | "Checking your browser…" → "Preparing your sample…" ✅ |
| 3 | Dashboard → Watch Lecture 5 | 1.1 s | no | ≈ 1–2 s + YouTube embed | player-ready gate on L / I buttons ✅ |
| 4 | Tap L / I, "Done watching" | instant (markers queued, batched) | no | instant | counter + toast + 5 s undo ✅ |
| 5 | Diagnostic (4–6 questions, confidence first) | 5 s for the whole run in e2e | no (graded in code) | < 300 ms per answer | — |
| 6 | Results → "Practice this" → spot the flaw | 0.4 s click → scenario | no (pre-generated bank) | instant | — |
| 6a | Ask the author | — (fake) | **yes**: author + leak check | < 4 s P95 target (≈ 2.5 s typical) | streaming/typing state ✅ |
| 6b | Submit (verdict + sentence + correction) | < 1 s | **yes**: correction judge | < 8 s P95 target | "Checking…" spinner ✅ |
| 7 | Teach-back with Sam | < 1 s per turn | **yes**: friend persona (streamed), judge on submit | first token < 2 s; judge < 8 s P95 | streamed text ✅, "Checking…" ✅ |
| 8 | Transfer submit | < 1 s | **yes**: transfer judge | < 8 s P95 | "Checking…" ✅ |
| 9 | Stump the AI submit | < 1 s | **yes**: referee → answer → referee (3 calls) | **11.0 s p50, 13.2 s p95** (`docs/evals/stump.csv`, 16 runs) | "Refereeing…" only ⚠️ (fix #3) |
| 10 | Back to the map to see red → amber → green | 3 navigations (Dashboard → Concept map → node) | no | < 1.5 s per map load | no direct link ⚠️ (fix #2) |

The only waits over 3 s are real-AI steps in prod: 6b, 7, 8 (up to 8 s) and 9 (11–13 s).
All of them show a pending state. Only Stump's ≈ 12 s wait gives no hint of how long it will take.

## Confusion points and dead ends

1. **Sample button can spin forever.** If `challenges.cloudflare.com` is blocked (corporate or
   campus network, privacy extension, DNS filter), the Turnstile script never loads. The click
   then shows "Checking your browser…" with no timeout and no error: a dead end on the judge's first
   click. Reproduced in this sandbox, where Cloudflare is blocked. `next/script` has no `onError`
   (`apps/web/src/components/sign-in/sign-in-actions.tsx:142-148`), and `handleSample` waits on
   `pendingRef` indefinitely (`:122`).
2. **No way back to the map from a finished activity.** The page only links "← Dashboard"
   (`apps/web/src/components/activity/activity-view.tsx:42`). Spec §4.1 ends with "node red → amber
   → green", but to see it the judge has to go Dashboard → Concept map → find the node. The
   mastery trail on the result card helps, but it is not the map.
3. **Stump takes ≈ 12 s with no expectation set** (`apps/web/src/components/activity/stump/stump-view.tsx:98`).
   A judge may assume it has hung.
4. **A reloaded spot-the-flaw loses "How it was graded".** After the final try, a reload re-fetches
   the explanation but not the rubric criteria, because `RubricList` only renders from the
   in-memory submit response (`apps/web/src/components/activity/spot-flaw/spot-flaw-view.tsx:59`,
   `:168`). Transfer and teach-back keep theirs on reload (now covered by e2e).
5. **The spec promises green after teach-back. Prod may give amber.** With the real judge, a short
   teach-back often scores partial, so §4.1 step 7 ("node turns green") is not guaranteed. The
   deterministic route to green is spot the flaw (correct) + Stump accepted, which is what the new
   e2e checks. Demo script: say "amber or green", or use Stump as the second activity type.
6. **Activity pages have no CS50 license notice** (F7.4; see `spec-compliance.md`). A judge
   checking attribution will find it on every other library page, but not here.
7. *(Low)* Clicking "Explore" again while signed in returns the same copy. This is on purpose
   (double click, back button), and "Reset sample" in the account menu is the clean restart.

## Ranked fix list

| Rank | Severity | Fix | Where | Lane |
|---|---|---|---|---|
| 1 | High | Turnstile load failure: `onError` on `<Script>` plus a ~10 s timeout after the click that sets the "security check didn't load" error and re-enables the button | `components/sign-in/sign-in-actions.tsx:122`, `:142` | Handoff (polish-ux) |
| 2 | Medium | "See it on the map" link under "Your mastery of this concept", or point the back link at `/courses/{courseId}` when the activity came from a map | `components/activity/activity-view.tsx:42`, `components/activity/spot-flaw/result-panel.tsx:196` | Handoff (polish-ux) |
| 3 | Medium | Stump pending copy: "Takes about 10 s: the referee checks your question, the AI answers, then the referee compares." | `components/activity/stump/stump-view.tsx:98` | Handoff (polish-ux) |
| 4 | Medium | Return the rubric for closed spot-the-flaw activities (GET `/activities/{id}` or the explanation response) and render `RubricList` from it | `packages/contracts/src/api/activities.ts`, `server/activities/spot-flaw.ts`, `spot-flaw-view.tsx:168` | Handoff (spot-flaw) |
| 5 | Medium | First-load JS ≈ 325–380 kB gzip on every route, mobile LCP 3–5 s | see `perf.md` | Handoff (polish-ux) |
| 6 | Medium | License notice on activity pages for library concepts | `components/activity/activity-view.tsx:39-65` | Handoff (polish-ux) |
| 7 | Low | Demo script: make Stump the second activity type for a guaranteed green | README / demo video | — |

## Verified OK

- The sample account lands on mixed mastery (all four states), Pointers is red with a confident
  mistake, and the next step points at Lecture 5. Unit test
  `apps/web/src/server/courses/sample-demo.test.ts`; e2e `judge-path.spec.ts`.
- Pointers has an unseen item for every activity type. Spot the flaw and transfer each have an
  unseen bank item. Teach-back and Stump grade against key points, which every concept has
  (`sample-demo.test.ts`).
- The full path with practice works: spot the flaw (wrong → Socratic retry → right) takes Pointers
  from red to amber, and an accepted Stump takes it to green. A reload keeps each finished activity
  finished, and Reset sample brings back red Pointers and removes the old activity
  (`e2e/mastery.spec.ts`).
