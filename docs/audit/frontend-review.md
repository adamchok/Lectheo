# Frontend review (code-level) — 2026-10-06, main @ 8300ccd

Four read-only reviews: WCAG 2.2 AA, React/Next correctness, UX/interface guidelines, HTML/web standards.
Deduplicated; key items spot-verified against the code. Paths relative to `apps/web/src/`.
Items marked **(#16)** are already in the server-gaps PR — skip them.

## P0 — judge-visible or high-severity (must fix)

| # | Area | file:line | Problem | Fix |
|---|---|---|---|---|
| 1 | UX | components/lecture/watch-view.tsx:100 | Toast shows raw enum: "Marked: lost". | Human labels: "Marked: I'm lost" / "Marked: Important". |
| 2 | UX | components/lecture/diagnostic-view.tsx:451-483 | Results page has no next action when there's no confident mistake. | Always show "Open concept map" + "Practice the weakest concept". |
| 3 | UX | components/course/concept-list.tsx:53 | List view (phone default + accessible alternative) only offers Spot the flaw. | Reuse node-panel's practice buttons (all four types, Stump with Beta badge). |
| 4 | UX | components/course/node-panel.tsx:20,46-54 | Practice click disables all four, no spinner/label; Stump button lacks Beta badge (F4d). | Track the clicked type: "Preparing…" + spinner on it; add Beta badge. |
| 5 | UX | components/activity/activity-view.tsx:49; teach-back-result.tsx:188,202; teach-back-view.tsx:181; stump-view.tsx:123 | Leaving an activity goes to Dashboard, not the map; teach-back ignores `?from=` so no amber→green change; stump "new from the map" has no link. | Back link → `/courses/{courseId}` (course name); "See it on the map" primary; read `?from=` like spot-flaw; link in stump. |
| 6 | UX/a11y | watch-view.tsx:251; lecture-view.tsx:270; globals.css | Sticky 56 px header covers the transcript heading and focused controls (2.4.11). | `html{scroll-padding-top:4.5rem}`; sticky panels `lg:top-20`; `scroll-mt-20` on anchor targets. (The new shell must keep this right.) |
| 7 | a11y 1.4.11/2.4.7 | app/globals.css:35,77,119 (`--input`); ui/button.tsx:7, ui/input.tsx:10-11, ui/checkbox.tsx:16, ui/radio-group.tsx:29, capture/course-picker.tsx:11, spot-flaw/answer-form.tsx:27, spot-flaw/scenario-list.tsx:38, diagnostic-view.tsx:354, confidence-picker.tsx:84 | Control borders ≈1.4–1.7:1; focus ring `ring-ring/50` ≈2.4:1 and `outline-none` removes the outline (also invisible in forced-colors). | `--input` ≥3:1 (e.g. `#8a8780` light, `#6b6e78` dark); focus `ring-2 ring-ring ring-offset-2` full opacity; `outline-hidden` instead of `outline-none`. Fix once in tokens/ui primitives. |
| 8 | a11y 2.1.4 | client/capture/use-marker-hotkeys.ts:39; components/confidence-picker.tsx:59; diagnostic-view.tsx:245 | Single-key shortcuts (L/I, 1–4, A–E) on `window`; A–E submits irreversibly. | Scope listeners to focus within the player / question region (or a persisted "Keyboard shortcuts" toggle in the account menu); `aria-keyshortcuts`; ignore when typing in inputs. |
| 9 | a11y 3.2.2 | confidence-picker.tsx:68-71 + diagnostic-view.tsx:227-231 | Radix radio arrow-key focus checks → immediately commits the rating and swaps UI. | Plain button group (click/Enter/Space commits), or commit on explicit action. Keep e2e keyboard flow working. |
| 10 | a11y 4.1.3/2.4.3 | diagnostic-view.tsx:350,391,409 | Chosen option becomes `disabled` → focus to body; FeedbackCard mounts with its live content; verdict never announced. | `aria-disabled` on options; always-mounted status region with the verdict; focus a `tabIndex=-1` verdict heading. |
| 11 | Web | app/layout.tsx:19; app/page.tsx:10 | No `metadataBase`, Open Graph/Twitter card, OG image — shared links show no preview. | `metadataBase` (NEXT_PUBLIC_SITE_URL, fallback https://lectheo.vercel.app), `opengraph-image` (1200×630, product look), `twitter: summary_large_image`, landing-specific OG title/description, canonical `/`. |
| 12 | UX | app/page.tsx ← auth/callback/route.ts:15-26 | `/?error=auth` ignored — failed Google sign-in is silent. | Read `searchParams.error`, pass initial error to SignInActions. |
| 13 | React | activity/teach-back/use-teach-back.ts:129-133 | Chat turns never update the cached activity; returning within staleTime loses turns / wrong turns-left. | `onFinish` → invalidate `queryKeys.activity(id)` (exact). |
| 14 | React | client/queries.ts:84-95,136-145,259-276; capture/delete-lecture-button.tsx | Processing → ready/failed doesn't refresh courses/map/transcript; `useProcessLecture` doesn't refresh courses; delete removes queries while the page is mounted (404 flash) and `push` keeps the deleted page in history. | Invalidate `['courses']` + `queryKeys.lecture(id)` on terminal status; `router.replace` first, then remove queries. |
| 15 | React | components/course/concept-map.tsx:133 | `colorMode="system"` ignores the next-themes choice → dark canvas on light page (or reverse). | `colorMode={resolvedTheme === 'dark' ? 'dark' : 'light'}`. |

## P1 — should fix

| # | Area | file:line | Problem | Fix |
|---|---|---|---|---|
| 16 | Perf | watch-view.tsx:60-71,238,271-292 | 500 ms `nowMs` tick re-renders player + whole transcript. | Move the tick into TranscriptPanel; `React.memo` rows. |
| 17 | Perf | course/course-view.tsx:18 → concept-map.tsx | React Flow + CSS loaded even for List view. | `next/dynamic(..., { ssr: false, loading: Skeleton })`. |
| 18 | Perf/UX | app/(app)/ | No `loading.tsx` → every nav waits on the server round trip. | Add `app/(app)/loading.tsx` skeleton matching the new shell. |
| 19 | a11y 2.2.1/3.3.1 | watch-view.tsx:27,100-114; spot-flaw-view.tsx:33; transfer-view.tsx:28; stump-view.tsx:192; delete-lecture-button.tsx:40; account-menu.tsx:57,68 | Marker undo only in a 5 s toast; errors only in auto-dismissing toasts. | Undo toast `duration: Infinity` (or marker list with delete); errors inline `role="alert"` near the form. |
| 20 | a11y 2.4.11 | course/course-view.tsx:72 | NodePanel overlays the canvas; tabbing reaches hidden nodes. | Panel beside the canvas (natural in the new layout). |
| 21 | a11y | spot-flaw/hint-ladder.tsx:44-50; stump-view.tsx:214-216; spot-flaw/author-chat.tsx:70,75; confidence-picker.tsx:64-69 | Live regions mount with content / double announcements / duplicate group label. | Always-mounted live regions; drop `aria-live` where the heading is focused; `role="log"` on the chat list; one label for the group. |
| 22 | a11y 2.5.3 | source-ref.tsx:55,69,80 | aria-label differs from visible "12:41". | sr-only "Play from" + visible text; drop aria-label. |
| 23 | a11y 2.5.8 | course/lecture-timeline.tsx:33-42 | Overlapping 24 px marker dots. | Cluster/offset markers closer than ~2 %; 32 px hit area. |
| 24 | a11y forms | capture/new-lecture-view.tsx:96-101,163; import-form.tsx:94-113; audio-form.tsx:72-84; transcript-form.tsx:96; stump-view.tsx:55 | Required not marked; disabled submit leaves tab order; errors/help not linked; stump instructions only in placeholder. | `required`, `aria-disabled`, `aria-invalid`, `aria-describedby`; visible helper text. |
| 25 | a11y | ui/tabs.tsx:66 | Inactive tab text ≈4.2:1. | `text-muted-foreground`. |
| 26 | UX | spot-flaw/author-chat.tsx:67-79; teach-back-view.tsx:220 | AI personas ("author", Sam) and AI outputs not labelled as AI. | Small "AI persona" / "AI-generated · checked by a separate judge" caption. |
| 27 | UX | spot-flaw/answer-form.tsx:21 | Verdict option "Correct" clashes with score label "Correct". | "No flaw". Update e2e selectors. |
| 28 | UX | dashboard/lecture-list.tsx:19-20,35; concept-list.tsx:93 | "Watch" on already-watched lectures (re-marking, F1.2); "L05" prefix collides with L marker. | "Review" once markers exist; "Lec 5". |
| 29 | Web | app/(app)/layout.tsx:5; no app/robots.ts | App pages indexable. | `robots: { index: false }` on (app); `robots.ts` allowing `/`, `/privacy`, `/terms`. |
| 30 | UX | page titles: app/(app)/courses/[id], lectures/[id]/*, activities/[id]; lecture-frame.tsx:42 | Generic titles/back labels ("Concept map", "Lecture", "Course"). | Course/lecture/concept names in titles (client `document.title` or `generateMetadata`) and back labels. |

## P2 — polish (do if cheap)

- next-step-card.tsx:56 "Start stump the ai" (`toLowerCase`) → per-type verb map. diagnostic-view.tsx:460 "1 questions" → pluralize. diagnostic-view.tsx:40 copy assumes markers exist.
- diagnostic-view.tsx:86,356,363,395 hard-coded `emerald-*` → mastery tokens; headings `font-semibold` sans vs serif elsewhere → follow the new type scale consistently.
- watch-view.tsx:164-170 disabled marker buttons need "Loading player…" helper.
- account-menu.tsx:116-118 "Signing out…" never visible; :138 Reset sample confirm → `variant="destructive"`.
- delete-lecture-button.tsx:47,56 disable trigger with reason instead of a "wait" dialog.
- Character counters on spot-flaw/answer-form.tsx:116, author-chat.tsx:98, teach-back-view.tsx:240 (like transfer/stump).
- client/format.ts:46 `'en-GB'` → viewer locale.
- globals.css:101-123 no-JS dark fallback misses mastery/marker tokens; add `color-scheme` (`:root{color-scheme:light dark}`, `.dark{color-scheme:dark}`); global-error.tsx dark styles.
- `aria-label` on role-less divs/spans (loading skeletons: course-view.tsx:83, lecture-frame.tsx:27, lecture-view.tsx:297,359, diagnostic-view.tsx:71,363,366, new-lecture-view.tsx:72, dashboard-view.tsx:25, lecture-list.tsx:80, app-shell.tsx:89, teach-back-view.tsx:193, result-panel.tsx:70,72) → `role="status"` + sr-only text / `role="img"`.
- concept-list.tsx:42,91,106 heading levels (h2 for lecture groups, h3 for concepts).
- mastery-badge.tsx:39 reasons only in tooltip → inline where shown in results.
- lecture-view.tsx:260-270 `?t=` deep link: `useSearchParams`, highlight the hit segment.
- watch-player.tsx:195, local-player.tsx:55 media `aria-label`; local-player `<track kind="captions">` from the uploaded transcript.
- license-notice.tsx:12 "(opens in new tab)" + icon; legal pages footer (Privacy · Terms · Home).
- `apple-icon.png` 180×180; preconnect YouTube (watch) and Turnstile (landing) via `ReactDOM.preconnect`.
- marker-queue-hook.ts:85-88,117 invalidate the lecture too, only when markers were sent; spot-flaw/transfer auto-reveal ref guard + `onError`; teach-back scrollIntoView keyed on length/status; transcript auto-follow pauses after manual scroll; watch-player `onEnded` once; concept-map selection shouldn't rebuild all nodes; `useStartActivity` invalidates courses.
- app/(app)/not-found.tsx unused → remove or call `notFound()`.

## Already covered by #16 (skip)
- F2.4 node-panel source moments + excerpt.
- F0.2 `/` → `/dashboard` for signed-in users (proxy).
- Diagnostic options `<ul>` focus outline.

## Verified OK (don't touch)
Landmarks, route-change focus, reduced motion, mastery icon+text, `lang`, themeColor, `next/font`, no `dangerouslySetInnerHTML`, `safeRedirect` on both redirect paths, storage wrapped in try/catch, every form button typed, no nested interactives, client/server boundary clean, StrictMode-safe diagnostic start, player/Turnstile/XHR cleanup.
