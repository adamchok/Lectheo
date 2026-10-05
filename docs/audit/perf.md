# Performance (pre-submission audit)

Date: 2026-10-05. Production build (`next build`, Next 16.3.8, Turbopack) served by `next start`
against local Supabase, `AI_FAKE=1`, signed in as a fresh sample account.

## First-load JS per route

Next 16 no longer prints per-route sizes in `next build`, so these were measured in Chromium:
the gzip-encoded bytes of every same-origin script loaded on a full page load (Playwright
`request.sizes().responseBodySize`). **Every route is over the 250 kB budget.**

| Route | First-load JS (gzip) | Scripts | Largest chunks (gzip kB) |
|---|---|---|---|
| `/` landing | **351 kB** | 15 | contracts+zod 103 · framework 71 · **supabase-js 62** · next 43 |
| `/dashboard` | **325 kB** | 18 | contracts+zod 103 · framework 71 · next 43 |
| `/lectures/[id]/watch` | **325 kB** | 18 | same shared set |
| `/lectures/[id]` | **322 kB** | 18 | same shared set |
| `/lectures/[id]/diagnostic` | **324 kB** | 18 | same shared set |
| `/lectures/new` | **325 kB** | 18 | same shared set |
| `/courses/[id]` (map) | **382 kB** | 19 | shared set + **React Flow 63** |
| `/activities/[id]` | **381 kB** | 19 | shared set + **AI SDK (`ai`) 56** |

Why it's heavy, biggest first:

1. **`@lectheo/contracts` + zod in every route (103 kB gzip, 437 kB raw).** Client code imports
   schemas from the package barrel (`packages/contracts/src/index.ts`). Zod v4 schema
   construction is top-level code that the bundler can't prove side-effect free, so it can't
   tree-shake unused schemas. The package has no `"sideEffects": false`.
2. **supabase-js on the landing page (62 kB).** `signInWithGoogle` is imported statically by
   `components/sign-in/sign-in-actions.tsx:10`, so GoTrue, Realtime and other clients ship before
   anyone clicks Google.
3. **AI SDK on every activity page (56 kB).** `components/activity/activity-view.tsx:12` imports
   `TeachBackView` (`useChat`) statically, so spot the flaw, transfer and stump pay for it too.
4. React Flow on the map (63 kB) is expected. The canvas is the page, and the list view is the
   accessible alternative.

## Lighthouse (mobile, simulated slow 4G + 4× CPU)

Lighthouse 12, `--form-factor=mobile`, local production server. Lab runs have no real input,
so **INP can't be measured**. Total Blocking Time (TBT) is the lab stand-in for INP.

| Page | Perf score | LCP | INP (lab: TBT) | CLS | FCP | LCP element / breakdown |
|---|---|---|---|---|---|---|
| Landing `/` | 0.81 | 3.9 s | n/a (TBT 320 ms) | 0 | 0.8 s | hero `<h1>`; render delay 3.5 s |
| Dashboard | 0.84 | 3.2 s | n/a (TBT 380 ms) | 0.021 | 0.8 s | page intro `<p>`; render delay 2.7 s |
| Course map | 0.70 | 5.4 s | n/a (TBT 430 ms) | 0.001 | 0.9 s | page intro `<p>`; render delay 4.9 s |
| Activity (spot the flaw) | 0.70 | 5.2 s | n/a (TBT 420 ms) | 0.001 | 0.8 s | scenario sentence; render delay 4.8 s |

LCP is almost all **render delay**: TTFB is ≈ 0.46 s on every page, with no resource load delay.
The LCP element appears only after the JS above has downloaded and run. On the dashboard, map and
activity pages, the content is client-rendered from React Query after hydration, so LCP waits on
the bundle and then a fetch. On the landing page, the hero text is static, but it repaints when the
Newsreader web font swaps in (4 font files, 193 kB, preloaded). CLS is fine everywhere.
Lighthouse estimates 96–186 KiB of unused JS per page.

The judge's target device is a laptop running Chrome (Spec §1), not mobile. On desktop (no
throttling), every page above loaded to `networkidle` in 0.7–1.2 s.

## Fixes

No config-level fix is in this lane: `next.config.ts` and the `package.json` files of the
workspace packages belong to other lanes. Handoffs, by expected win:

| Win | Change | File |
|---|---|---|
| Some of the 103 kB on every route | Add `"sideEffects": false` to `packages/contracts/package.json` (safe: contracts are schema-only), then re-measure. It prunes unused contract modules, not zod itself, so expect well under the full chunk. Fallback: per-file subpath imports (`@lectheo/contracts/api/session`), which first need `exports` entries, because only `"."` is mapped today | `packages/contracts/package.json` |
| 62 kB on landing | Load supabase-js on click: `const { signInWithGoogle } = await import('@/client/supabase')` inside `handleGoogle`, dropping the static import | `components/sign-in/sign-in-actions.tsx:10`, `:126` |
| 56 kB on spot-flaw / transfer / stump | `const TeachBackView = dynamic(() => import('./teach-back/teach-back-view').then((m) => m.TeachBackView))` from `next/dynamic` | `components/activity/activity-view.tsx:12` |
| LCP on dashboard / map / activity | Prefetch the page query on the server and hydrate (React Query `HydrationBoundary`), so the LCP text is in the HTML | `app/(app)/**/page.tsx` |
