# Lectheo workstreams (parallel worktrees)

> **Historical:** the foundation-era split (waves 1–4, early Oct 2026). Counts and ownership below are as of then (the schema now has 24 tables). The current product is described in the `docs/Lectheo *.md` specs.

The foundation is on `main`. Each workstream below runs in its own git worktree / branch
(`feat/<name>`), owns a disjoint set of files, and merges back via PR with `pnpm check` green.

## What the foundation already provides

| Area | Ready to use |
|---|---|
| Contracts | Every request/response schema in `packages/contracts/src/api/*`, jsonb shapes in `payloads.ts` |
| DB | All 21 tables + RLS deny-all + `clone_sample`/`reset_sample`/`purge_sample_accounts`; PGlite `createTestDb()`; CS50 L3–L5 fixture + seed student (`@lectheo/db/seed`) |
| Domain | VTT/SRT/text parsing, speaker stripping, 40 s segmenting, scaling, marker alignment, mastery, recommender, spot-flaw/rubric/stump scoring, diagnostic findings + plan, graph checks |
| AI | `runTask`, `streamPersona`, `checkLeak`, role routing, fakes for every task (`AI_FAKE=1`); hooks wired in `server/ai-hooks.ts` |
| Server | `route()` wrapper, auth (`getActor`), ownership helpers, quotas, governor, Turnstile, signed Storage URLs |
| API live | health, me, session/sample(+reset), sign-out, auth/callback, cron/daily, courses (GET/POST), courses/{id}/map, courses/{id}/next, lectures/{id} (GET/PATCH/DELETE), lectures/{id}/transcript (GET), activities core (all routes, spot_flaw + teach_back minimal handlers) |
| UI | Design system, AppShell, sign-in (Google + Turnstile sample), dashboard, course list view, typed `apiFetch` + query hooks, `MasteryBadge`, `SourceRef` + `PlayerContext`, `ConfidencePicker`, `useMarkerHotkeys`, page skeletons with `TODO(feature-*)` |

## Must (judge path) — start these in parallel

| # | Workstream | Owns | Builds | Spec |
|---|---|---|---|---|
| 1 | `watch-mode` | `components/lecture/watch-view.tsx`, `client/capture/{watch-player,marker-queue}*`, `server/lectures/markers*`, `api/v1/lectures/[id]/markers/**` | YouTube IFrame player (+ MP3 fallback), L/I markers, IndexedDB marker queue (batch every 10 s, ON CONFLICT), undo 5 s, align on write (`domain/alignMarkers`), transcript side panel, `PlayerProvider` | F1.1–F1.4, F2.3, Arch §4.2, §6.1 |
| 2 | `concept-map` | `components/course/**`, `lib/features.ts#conceptMapCanvas` | React Flow canvas with stored layout, custom nodes (MasteryBadge + markers), edge labels, keyboard nav, lecture timeline with unlinked markers, node → practice entry | F2, F6.1, Arch §7 |
| 3 | `diagnostic` | `server/diagnostic/**`, `api/v1/lectures/[id]/diagnostic`, `api/v1/diagnostic/**`, `components/lecture/diagnostic-view.tsx` | Plan (domain `planDiagnostic`), confidence-first, guarded answer, follow-up rule, results ordering, confident-mistake card with `SourceRef` | F3, API §6, Arch §4.4 |
| 4 | `spot-the-flaw` | `server/activities/spot-flaw.ts`, `packages/ai/src/tasks/{author-reply,judge-correction}`, spot-flaw UI under `components/activity/spot-flaw/**` | Real prompts, leak-check tuning (`eval-guard`), hint ladder UI, verdict + sentence pick + correction, Socratic retry, final reveal | F4c, F5, Arch §4.5 |
| 5 | `teach-back` | `server/activities/teach-back.ts`, `packages/ai/src/tasks/{friend-reply,judge-teach-back}`, `components/activity/teach-back/**` | `useChat` streaming UI, persona prompt, key-point judge, retry | F4a, F5, Arch §4.6 |
| 6 | `capture-import` | `app/(app)/lectures/new/**`, `components/capture/**`, `client/capture/local-player*`, `server/lectures/{create,transcript-upload,audio-upload}*`, `api/v1/lectures/route.ts`, `api/v1/lectures/[id]/{transcript (POST),audio-upload-url}` | Consent checkbox, import local video + .vtt/.srt (video never uploaded), audio upload via signed URL, transcript paste/upload, per-tier limits, `lib/features.ts#addLecture`/`createCourse`. Also small coordinated edits: `components/lecture/watch-view.tsx` (local player for imports, after-watching CTA by status) and `components/lecture/lecture-view.tsx` (delete button, Watch for imports). Consent is per browser session (`sessionStorage`), client-only; audio size is client-declared at URL signing (Arch §9.2) | F1.5–F1.7, F1.11, F8.1, F8.3 |
| 7 | `pipeline` | `server/pipeline/**`, `server/stt/**`, `api/v1/lectures/[id]/process`, `components/lecture/lecture-view.tsx`, `packages/ai/src/tasks/{extract-concepts,draft-items,verify-items}` | Vercel Workflow `processLecture` (day-1 spike; `after()` fallback), `pipeline_steps`, AssemblyAI poll loop, extract → validate → ELK layout → align → draft → verify, progress UI | Arch §4.3, §5.3, ADR-002 |
| 8 | `library-bank` | `scripts/seed-library.ts`, `scripts/eval-*.ts`, `packages/db/src/seed/**` | Real CS50 subtitles → Opus extraction + item bank + Sol verification (dev key), replaces fixture; eval CSVs for README | F7, §8 quality rules, ADR-010 |
| 9 | `e2e-judge-path` | `apps/web/e2e/**` | Playwright judge path with `AI_FAKE=1` against a seeded DB. All four activity types, reload of finished activities, mastery red → amber → green and Reset sample (`mastery.spec.ts`). `E2E_OFFLINE=1` stubs Turnstile for sandboxes without Cloudflare access | Arch §10 |

## Should (after Must is solid, in order)
record-live (`/lectures/[id]/record`, recorder reducer + IndexedDB pieces) → stump-the-ai → transfer →
slides input → transcript correction → own-course dedupe → persona picker.

## Merge rules
- **Contracts first:** a workstream that needs a contract change lands it in a small PR first (or
  coordinates), since every workstream imports `@lectheo/contracts`.
- **Migrations:** only add migrations via `pnpm db:generate`. If two branches add one, the second to
  merge deletes its migration, rebases, and regenerates (journal numbering must stay linear).
- **Feature flags:** `lib/features.ts` / `server/features.ts` have one line per feature — flip only
  your own.
- **Shared files** (`client/queries.ts`, `components/ui/*`): append, don't restructure.
- Every PR: `pnpm check` green, judge path still works (`pnpm --filter @lectheo/web e2e` once #9 lands).
