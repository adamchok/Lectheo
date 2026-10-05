# Security (pre-submission audit)

Date: 2026-10-06. Scope: every route under `apps/web/src/app/api/**`, every `apps/web/src/server/**`
entry point, `proxy.ts`, `next.config.ts`, migrations, `packages/ai/src/guard.ts`. OWASP Top 10 +
LLM Top 10 mindset. Severity: Critical / High / Medium / Low.

## Findings

| # | Area | Finding | Sev | Status |
|---|---|---|---|---|
| 1 | Headers | No security headers at all: pages frameable (clickjacking), no `nosniff`, no Referrer-Policy, no CSP. | Medium | **Fixed** — `next.config.ts` `headers()`: enforced CSP `frame-ancestors 'none'; object-src 'none'; base-uri 'self'` + full CSP as report-only (Next's inline scripts break a strict no-nonce CSP; includes the Supabase, Turnstile and YouTube player origins), `X-Frame-Options: DENY`, `nosniff`, `strict-origin-when-cross-origin`, `Permissions-Policy` (mic self only). e2e `security-headers.spec.ts`. |
| 2 | Logs | `http.ts` logged `err.message` for unexpected errors. drizzle's `DrizzleQueryError` message embeds the SQL **and its params** — student answers, transcript segments, item answer keys could land in Vercel logs. | Medium | **Fixed** — `errors.ts` `safeErrorMessage` describes a failed query (drizzle's `Failed query:` message; its `name` is plain `Error`) by the driver error it wraps, capped at 500 chars. Used by `http.ts` and by `pipeline/state.ts` `runStep`, which re-throws a param-free copy to the Workflow runtime (which logs it). Some postgres messages still quote one literal value (e.g. `invalid input syntax for type uuid: "…"`); the cap bounds it. `http.test.ts`, `pipeline.test.ts` (a real PGlite failed query). |
| 3 | Answer secrecy (F5.3) | Spot-the-flaw try 1 that reached the judge (right sentence + partial correction) returned the frozen rubric's criterion **labels** before close; labels hint at the fix. Transfer/teach-back already genericised theirs. | Medium | **Fixed** — `Criterion n` labels; real labels only in `finalReveal`. `spot-flaw.test.ts`. |
| 4 | Stump replay (deferred NIT) | Identical-body replay (`submit.ts` `replayOrConflict`) rebuilt sources from the concept, not the referee's citations for that try. | Low | **Fixed** — attempts store `grading.sources`; replay uses them (falls back for older rows). Needed one optional field on `AttemptGrading` in contracts. `stump.test.ts`. |
| 5 | Abuse | Sample sign-in runs server-side, so Supabase's `anonymous_users` limit (300/h per IP) sees Vercel's egress IPs: effectively a global cap, not per client. Per-client gate is Turnstile (server-verified, single-use). Blast radius bounded by per-account quotas (1 lecture, 60 llm_tasks, 30 activities / day) and the global spend governor (intake pause at $3/h). | Medium | Accepted — a per-IP limiter needs a new table (schema.ts, out of lane). See PR Handoff. `clientIp` takes the first hop of `x-forwarded-for`, trustworthy only because Vercel overwrites that header; a future per-IP limiter must key on the same header. |
| 6 | DB functions | `clone_sample` / `reset_sample` / `purge_sample_accounts` revoke EXECUTE from PUBLIC only; Supabase's default privileges may still grant EXECUTE to `anon`/`authenticated`. They are SECURITY INVOKER and those roles have no table privileges + RLS deny-all, so a PostgREST `rpc()` call fails. | Low | Documented (defence in depth: `REVOKE … FROM anon, authenticated` in a future migration). |
| 7 | Prompt injection (guard) | Jev (`guard.ts`) gets the author reply as a raw `state` field (not an `untrusted()` block). The reply is model output, so a student can only influence it indirectly; keyword regex runs first and Luna escalation does wrap it. | Low | Documented. |
| 8 | Judge scores | `gradedCriteria` (packages/ai) doesn't clamp a per-criterion score to its max; totals and outcomes are clamped in `domain/rubricOutcome`, so only a displayed criterion score could exceed max. | Low | PR Handoff. |
| 9 | Teach-back | Judge's guiding question isn't leak-checked (spot-flaw and transfer are). The judge prompt forbids revealing key points, and pointing at a missing point is the pedagogy. | Low | Documented. |

## Verified OK

- **AuthN/AuthZ.** Every `/api/v1/**` route goes through `route()`; all but `health`, `session/sample`,
  `session/sign-out` (intentionally public) are `auth: 'required'`. Every row load is ownership-scoped
  (`ownership.ts`, `loadOwnedActivity`, `loadOwnedSession`, `loadConceptForRead`) and misses, foreign
  ids and malformed ids are 404. PGlite IDOR tests cover activities (all 6 endpoints, create replay,
  concept in another user's course), diagnostic (all 4), courses map/next, lectures, markers,
  uploads. Sample accounts own only their cloned rows; the seed profile can never be an actor.
- **Cron.** `/api/cron/daily` requires `Bearer CRON_SECRET` (timing-safe compare); unset secret → 500,
  never open.
- **Answer secrecy (ADR-009).** Responses pass explicit contract schemas (unknown keys stripped,
  `contracts.test.ts`). Answer keys, rubric descriptions, model solutions, `item_secrets`,
  `leak_keywords`, `rubric_snapshot`, `key_points` and referee internals only appear in
  `finalReveal` (closed) or the explicit "Show me" explanation (marks later tries assisted).
  Diagnostic options appear only after confidence; `correctOptionId` only after the graded answer.
  Leaking author drafts are stored `visible = false` and never returned.
- **Prompt injection.** All student text and transcripts go in `untrusted()` blocks with tag
  breakout neutralised and `UNTRUSTED_RULE` in the system prompt; judge outputs are schema-validated
  (+ task validators, one repair, then fail). Verdict/location (spot-flaw) and MCQ grading run in
  code, so a student instruction can't flip them; stump acceptance re-derives validity from every
  check (`isAccepted`). Covered by the stump adversarial-input and "valid with a failed check" tests.
- **Cost.** Every AI-calling route uses `aiContext({ actor })` → governor + `llm_tasks` quota + ledger;
  the pipeline is gated by `lectures`/`reprocess` quotas + `assertIntakeOpen`. Request bodies are
  bounded by contract `max()`s; transcripts ≤ 2 MB (Content-Length pre-check); audio size checked
  per tier and capped by the bucket.
- **Storage.** Buckets private; keys built server-side from `actor.userId` + a UUID lecture id (no
  user-controlled path segments); signed download URLs 1 h, upload URLs 2 h.
- **CSRF.** Supabase auth cookies are `SameSite=Lax`; all mutations are POST/PATCH/DELETE with JSON.
- **Errors.** Unknown errors → `internal_error` with a generic message; storage error causes only in
  development; pipeline failures map to fixed user-facing messages.
- **Secrets.** Only `NEXT_PUBLIC_SUPABASE_URL`, `…_PUBLISHABLE_KEY` and `…_TURNSTILE_SITE_KEY` are
  public.
- **RLS.** Migration 0001 enables RLS with no policies on every table and revokes table privileges
  from `anon`/`authenticated`; the migrations test fails on a table without RLS.
