# Lectheo — agent guide

Lectheo (LEK-thee-oh): AI study partner. Students mark "lost"/"important" moments in a lecture →
concept map → confidence-rated adaptive diagnostic → spot the flaw + teach-back → mastery map.
Hackathon build (ForgeHacks 2026). **The judge path must work every time** (Architecture §1).

## Read first
- `docs/Lectheo Product Spec.md` — requirements (F0–F8, IDs referenced in code comments)
- `docs/Lectheo Architecture.md` — flows, domain rules (§6), failure modes
- `docs/Lectheo API Spec.md` — every endpoint; `packages/contracts` is its executable form
- `docs/Lectheo Data Model.md` — tables, invariants (§6)
- `docs/WORKSTREAMS.md` — who owns which files in parallel worktrees
- `apps/web/AGENTS.md` — Next.js 16 differs from training data; read `node_modules/next/dist/docs/`

## Layout and boundaries
- `packages/contracts` — Zod schemas for every request/response + jsonb shapes + enums. **Change the
  contract first**, then server and client. Enum values live only here (db pgEnums import them).
- `packages/db` — Drizzle `schema.ts`, migrations, `createTestDb()` (PGlite, no Docker), seed
  fixture (`@lectheo/db/seed`: `seedAll(db)`, stable ids like `conceptId('hash_tables')`).
- `packages/domain` — pure rules (no I/O, pass `now` in). Unit-tested.
- `packages/ai` — the only AI seam. `runTask(task, input, aiContext(...))`. Never call `ai` directly
  from the app. Tasks live in `packages/ai/src/tasks/<name>/{schema,prompt,task}.ts`.
- `apps/web/src/server` — server-only services by feature; `apps/web/src/app/api/v1/**/route.ts`
  stays thin: `route({ auth, body, query, params, response }, handler)` from `server/http.ts`.
- `apps/web/src/client` — browser code (`apiFetch`, query hooks, capture). `src/components` — UI.

## Rules that protect correctness
- **Information hiding (ADR-009, amended 7 Oct 2026):** never select 🔒 data (`item_secrets.*`:
  answer keys, flaws, rubrics, hints, leak keywords; `activities.rubric_snapshot`) into a response.
  `concepts.key_points` are no longer secret but appear only in the Study brief
  (`GET /lectures/{id}/brief`). Responses always pass an explicit contracts schema (unknown keys
  stripped). `server/contracts.test.ts` guards this.
- **Ownership:** load resources via `server/ownership.ts`. Another user's id → 404, never 403.
- **Safe retries (ADR-007):** client-generated UUIDv7 ids + `ON CONFLICT DO NOTHING`; state changes
  are guarded updates (`… WHERE status = 'active' RETURNING`). No idempotency tables.
- **Mastery is computed on read** from `attempts` (`server/mastery.ts`). Never cache it.
- **AI calls:** `aiContext({ actor, lectureId, intake, db })` from `server/ai-hooks.ts` wires the
  spend governor, quota and `llm_calls` ledger. Wrap with `toApiError()` in catch blocks.
- **Untrusted text** (transcripts, student answers) goes in `untrusted(tag, text)` blocks.
- **New tables need RLS** enabled in their migration (the migrations test fails otherwise).
- **Drizzle gotcha:** in a single-table select, `sql\`${table.col}\`` renders without the table
  name, so correlated raw subqueries bind to the wrong table. Alias subquery tables and spell the
  outer column as `"lectures"."id"`.
- **Unbuilt features are hidden** (Spec §3): gate entry points with `apps/web/src/lib/features.ts`
  (UI) / `apps/web/src/server/features.ts` (server). Flip your flag when the feature works.

## Commands
```bash
pnpm check                          # typecheck + lint + test, all packages
pnpm --filter @lectheo/web test     # one package
pnpm db:generate                    # migration from schema.ts (then commit the SQL)
pnpm --filter @lectheo/web e2e      # Playwright, AI_FAKE=1
```
Tests use `AI_FAKE=1` and PGlite; server tests mock `server-only` with `vi.mock('server-only', () => ({}))`.

## Style
No semicolons, single quotes, 2 spaces, 100 cols (Prettier). Small files (<400 lines typical).
Explicit types on exports. Immutable updates. Mark deliberate shortcuts with `ponytail:` comments.
Conventional commits (`feat(scope): …`).
