---
title: Lectheo Design System
updated: 2026-10-06
version: v1
tags:
  - lectheo
  - design
  - ui
  - ux
related:
  - "[[Lectheo Product Spec]]"
  - "[[Lectheo Architecture]]"
  - "[[Lectheo Tech Stack]]"
  - "[[Lectheo Competition]]"
  - "[[Lectheo Landing Copy]]"
---

# Lectheo Design System

Part of the doc set: [[Lectheo Product Spec]] · [[Lectheo Architecture]] · [[Lectheo Tech Stack]] · **Design System** · [[Lectheo Landing Copy]]. The library and motion decision is recorded as [[Lectheo Tech Stack#ADR-016 · Design system and motion: tokens first, CSS before JavaScript|ADR-016]].

> Source of truth for tokens, UX foundations, motion, the app shell and the landing page. Interactive version (live token tables, previews in both themes): https://claude.ai/artifact/DUPAHrAQEWtkeF7qbHy9Tz. Tokens are implemented in `apps/web/src/app/globals.css`; keep this file, the artifact and globals.css in step.

Contents: 1. Overview and brand · 2. Tokens · 3. UX foundations · 4. App shell · 5. Landing page · 6. Components

## 1. Overview and brand

Lectheo is a calm, precise study workspace for CS students. It should feel like a serious tool in the Linear and Vercel tradition, with an academic voice: paper and ink, one blue accent, serif titles, dense but never cramped. Everything here names tokens from section 2. Implement them as CSS custom properties in `apps/web/src/app/globals.css` and use them through Tailwind (`bg-background`, `text-muted-foreground`, `rounded-lg` …). Never write a literal colour in a component. The sections after this one cover UX foundations (states, loading, motion), the app shell and the landing page.

### Principles

1. **Calm density.** Show more at once with less noise: hairlines instead of boxes, one accent, quiet secondary text. Density comes from rhythm and alignment, not smaller type.
2. **One clear next step.** Every screen has one primary action, and every result points to what to do next (usually "See it on the map").
3. **Always show state.** The student can always tell what is happening, what just happened and what will happen next: loading, grading, saved, failed.
4. **Grounded and honest.** Every explanation cites the lecture moment it came from. AI is labelled as AI; grading names its judge. Answer keys never appear before the student has tried.
5. **Keyboard and screen-reader first.** Everything works without a mouse; focus is always visible and lands somewhere sensible.
6. **Fast by feel.** Respond within 100 ms to every input, keep old content on screen while new content loads, and reserve motion for meaning.

### Voice and copy

- Write to one student, in the second person: "Find what you missed. Prove what you know." No "we" in the UI except on legal pages.
- Sentence case everywhere: buttons, titles, menu items ("Start practice", not "Start Practice"). Product names keep their capitals: Spot the flaw, Teach-back, Transfer, Stump the AI.
- Use the product's own words, never system names: "I'm lost" and "Important" (never `lost`/`important`); "Needs work · Getting there · Mastered · Not tested" (never red/amber/green); "confident mistake", "concept map", "diagnostic".
- Buttons say exactly what happens: "Submit", "Retry", "See it on the map", "Reset sample". Pending labels name the work: "Grading…", "Preparing…", "Checking your browser…".
- Errors say what went wrong and what to do next, with no apology and no codes: "The security check didn't load. Check your connection or ad blocker, then try again."
- Label AI honestly: personas are marked AI ("Sam · AI student"); graded results say "Checked by a separate judge". No hype words (revolutionary, magic, supercharge), no emoji, no exclamation marks.
- Numbers and times: tabular figures; timestamps `12:41` in `mono-sm`; durations in words ("about 15 seconds"); dates through `Intl` in the viewer's locale.

### Colour

- Ground is `background`; text is `foreground`; secondary text is `muted-foreground`. Raise one object at a time on `card`; recess navigation and transcripts on `sunken` (the sidebar uses `sidebar`, an alias of `sunken`).
- `primary` (ink blue) is the only accent: the primary action (one per view), links, active indicators, the logo mark and focus. Selected rows and active nav use `accent` with `accent-foreground`, not a primary fill. A fill alone is too faint to mark state (about 1.1:1), so on/active controls (toggles, nav links) also carry a 2px `primary` underline (`inset-shadow-[0_-2px_0_0_var(--primary)]`, ≥ 3:1).
- Separate regions with `border` hairlines. A control's own edge uses `input` (≥ 3:1). Never rely on `border` alone to show where a field or checkbox is.
- Mastery states (rules in [[Lectheo Architecture#6.2 Mastery|Architecture §6.2]]) are a semantic set: `mastery-*-fg` text on `mastery-*-bg` for badges, `mastery-*-solid` for bars, rings and map nodes. Always pair the colour with its icon (dashed circle, alert circle, ellipsis circle, check circle) and its label. Never use mastery colours for anything else: no green success buttons, no red decoration.
- Markers: `marker-lost-*` (flag icon, "I'm lost") and `marker-important-*` (star icon, "Important"). Same rule: icon, word and colour together.
- `destructive` is for irreversible actions and error text only; text on its fill is `destructive-foreground`.
- Dark theme is designed, not inverted: `primary`, `destructive` and the `-fg` tokens lighten, so their foreground tokens flip to dark ink. Check both themes for every new pair.

### Typography

- Three families: `display` (Newsreader) for titles and the wordmark, `ui` (Source Sans 3) for everything else, `code` (JetBrains Mono) for code, timestamps and keys. They load through `next/font` in `app/layout.tsx`.
- App pages: one `title-lg` h1 (in PageHeader), `title-md` for card and panel titles, `heading` for in-card sections, `body` for reading, `body-sm` for controls and dense lists, `caption` for meta. Landing: `display-xl` hero, `display-lg` section titles, `body-lg` leads.
- Serif is for titles only, never for buttons, labels, tables or body text. Weights: serif 500 (wordmark 600), sans 400 and 600. Italic only for the one emphasised word in the hero ("*Prove*").
- `overline` (uppercase, tracked) is for eyebrows and sidebar section labels, never sentences.
- Reading columns stop at `reading-max`; headings use `text-wrap: balance`, paragraphs `text-wrap: pretty`.

### Layout and spacing

- 4px grid (`space-*`). Group with flex or grid `gap`; avoid margins between siblings.
- App: sidebar (`sidebar-width`, collapsible to `sidebar-rail`) beside the content column. Content is centred up to `content-max` with a gutter of `space-4` below 640px and `space-6` above; vertical page padding `space-6`, `space-8` from 1024px. Detail panels take `panel-width` on the right instead of floating over content.
- Rhythm in the app: PageHeader, then `space-8`, then sections separated by `space-8`; inside cards `space-4` or `space-5`. Landing sections: `space-16` padding, `space-24` from 1024px.
- Sticky elements sit below the top bar: `html { scroll-padding-top: calc(var(--topbar-height) + 16px) }` (72px), and sticky panels offset by `topbar-height` plus `space-4`.
- Works from 320px wide and at 400 % zoom with no horizontal page scroll. Wide tables and the comparison grid scroll inside their own container.

### Shape and depth

- Radii by role: `radius-sm` badges, chips and sidebar items; `radius-md` controls; `radius-lg` cards, panels and dialogs; `radius-xl` the hero card and product frames; `radius-full` dots and pills.
- Hairlines over shadows. `shadow-xs` only on outline buttons and inputs; `shadow-popover` on things that float (menus, dialogs, toasts, the mobile sidebar); `shadow-frame` only around landing screenshots. No coloured shadows, glows or surface gradients.
- A card is one object you can act on. A page is not a stack of cards: rows inside one card, or plain sections split by hairlines, read denser and calmer.

### Focus and accessibility

- Focus: a solid 2px `ring` outline with a 2px offset on every focusable element, at full opacity. It comes from one global `:focus-visible` rule in `globals.css`; components add no focus utilities, so it also survives forced-colors mode (where box-shadow rings are stripped). Where the real control is visually hidden, the visible wrapper takes the outline with `has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring`; menu items pull it inside with `-outline-offset-2`. Never `outline-none` or an unconditional `outline-hidden` on a focusable control.
- Targets at least `target-min` (24px); icon buttons 32px, buttons 36px (`h-9`), large calls to action 40–44px.
- Text contrast at least 4.5:1, large text and UI boundaries at least 3:1, in both themes.
- Single-key shortcuts (L/I while watching, 1–4 confidence, A–E answers) only act while focus is inside their region, never while typing, and are shown with `kbd` hints.

### Iconography

- **Library:** `lucide-react` only. Never mix in another set, emoji or hand-drawn SVG icons.
- **Sizes:** 16px (`size-4`) in buttons, inputs, menus, the sidebar and inline text; 20px (`size-5`) in empty states and panel headers; 14px (`size-3.5`) only inside badges and chips. No other sizes.
- **Stroke:** 2px as shipped. Never pass `strokeWidth`. `absoluteStrokeWidth` is off.
- **Colour:** `currentColor` only. An icon takes the colour of its text; give the text the token, not the icon.
- **Accessibility:** icons beside text are `aria-hidden`. An icon-only button needs an `aria-label` with the action's verb ("Delete lecture"), a tooltip with the same words, and a hit area of at least `target-min` (24px).
- **Exceptions:** brand marks are inline SVGs and are never redrawn with Lucide. Examples are the Lectheo mark (`<LogoMark />`) and the Google "G" on the sign-in button. Radio and menu-radio indicator dots are CSS shapes, not icons.
- **One icon per meaning.** Use this table. Add a row before using a new icon for a recurring action.

| Meaning | Icon |
|---|---|
| I'm lost (marker) | `Flag` |
| Important (marker) | `Star` |
| Not tested / Needs work / Getting there / Mastered | `CircleDashed` / `CircleAlert` / `CircleEllipsis` / `CircleCheck` |
| Confident mistake | `TriangleAlert` |
| AI-generated content | `Sparkles` |
| In progress | `LoaderCircle` (spinning, via `<Spinner />`) |
| Home | `House` |
| New lecture / add | `Plus` |
| Course (CS50 library / your own) | `BookOpen` / `FolderOpen` |
| Lecture / play from a moment / Watch | `Play` |
| Study (the lecture brief), Read about it | `BookOpenText` |
| Diagnostic | `ClipboardCheck` |
| Map view / list view | `Network` / `List` |
| Spot the flaw / Teach-back / Transfer / Stump the AI | `SearchCheck` / `MessagesSquare` / `Shuffle` / `Swords` |
| Spot the flaw verdict: correct / flawed | `CircleCheck` / `SearchX` |
| Stump the AI: AI stumped / grounded in the lecture / in general knowledge | `Trophy` / `BookOpen` / `GraduationCap` |
| Hint | `Lightbulb` |
| Guiding question | `MessageCircleQuestion` |
| Show the explanation | `Eye` |
| Send a message | `SendHorizontal` |
| Undo | `Undo2` |
| Retry | `RotateCw` |
| Delete | `Trash2` |
| Reset sample | `RotateCcw` |
| Upload | `Upload` |
| Draft | `FilePen` |
| Video file / audio / audio-only player | `FileVideo` / `AudioLines` / `Headphones` |
| A YouTube link (Add lecture → From YouTube) | `Link` |
| Transcript | `FileText` |
| Account | `CircleUser` |
| Theme light / dark / system | `Sun` / `Moon` / `Monitor` |
| Sign out | `LogOut` |
| Collapse / expand sidebar | `PanelLeftClose` / `PanelLeftOpen` |
| Mobile menu | `Menu` |
| Close | `X` |
| Breadcrumb separator / disclosure | `ChevronRight` |
| Go to the next step / back | `ArrowRight` / `ArrowLeft` |
| External link | `ArrowUpRight` |
| Note | `Info` |
| Not found | `SearchX` |
| Success (inline) / error (inline) | `Check` / `CircleX` |

### Logo

- The mark is a lens: an open circle with an off-centre focal point (theōria, "seeing"), drawn in `primary`. The wordmark "Lectheo" is set in `display` 600 with -0.01em tracking in `foreground`. Minimum mark size 20px; keep one mark-width of clear space. The SVG is in Assets › Logos; in code use `<Wordmark />` and `<LogoMark />` from `components/wordmark.tsx`.

## 2. Tokens

### Colour

| Token | Light | Dark | Usage |
|---|---|---|---|
| `background` | `#fbfaf7` | `#121317` | Page ground behind everything. Warm paper in light, blue-black in dark. |
| `foreground` | `#1c1d22` | `#e8e8ec` | Primary text and icons on background, card, sunken and popover (≥ 13:1 in both themes). |
| `card` | `#ffffff` | `#1a1b20` | Raised surfaces that are one object: a question, a result panel, a course card. Use by role, not on every block. |
| `card-foreground` | `#1c1d22` | `#e8e8ec` | Text on card. |
| `popover` | `#ffffff` | `#1d1e24` | Menus, tooltips, dialogs, sheets. |
| `popover-foreground` | `#1c1d22` | `#e8e8ec` | Text on popover. |
| `sunken` | `#f5f3ee` | `#16171c` | Recessed areas: the app sidebar, transcript panel, code and quote wells, the landing final CTA band. |
| `primary` | `#2b4acb` | `#8ea2ff` | Ink blue, the one accent. Primary buttons, links, active indicators, the logo mark, the focus ring (via ring). ≥ 7:1 on background in both themes. |
| `primary-foreground` | `#ffffff` | `#0d1230` | Text and icons on primary fills. Dark text in dark theme because primary lightens there. |
| `secondary` | `#f0eee9` | `#23242a` | Secondary button fill, quiet chips. |
| `secondary-foreground` | `#1c1d22` | `#e8e8ec` | Text on secondary. |
| `muted` | `#f2f0eb` | `#202127` | Hover fills, skeleton blocks, inactive tab track. |
| `muted-foreground` | `#5d5f68` | `#a3a5ae` | Secondary text: descriptions, meta, captions, inactive tabs, placeholders. ≥ 6:1 on background and ≥ 5.5:1 on muted in both themes. |
| `accent` | `#eceff9` | `#222a4a` | Selected and active rows, active nav items, the highlighted transcript segment, the Lectheo column of the comparison table. |
| `accent-foreground` | `#1c2a6b` | `#d5dcff` | Text on accent. |
| `destructive` | `#b42318` | `#ff8a7d` | Irreversible actions and error text (delete lecture, reset sample, form errors). Always paired with words. |
| `destructive-foreground` | `#ffffff` | `#2a0a06` | Text on a destructive fill. Dark text in dark theme because destructive lightens there. New: replaces the hard-coded text-white in ui/button.tsx. |
| `border` | `#e4e1da` | `#2c2d34` | Hairlines: dividers, card and panel edges, table rules, the sidebar edge. Decorative only, never the sole boundary of a control. |
| `input` | `#8a8780` | `#6b6e78` | Borders of text fields, checkboxes, radios, selects and outline buttons. ≥ 3:1 on background and card in both themes (WCAG 1.4.11). Changed from #d6d3cb / #3a3c45, which were about 1.4:1 and 1.7:1. |
| `ring` | `#2b4acb` | `#8ea2ff` | Focus indicator: a solid 2px outline, offset 2px, at full opacity on every surface. Never a translucent ring alone. |
| `sidebar` | `{sunken}` | `{sunken}` | App sidebar ground. |
| `sidebar-foreground` | `{foreground}` | `{foreground}` | Sidebar item labels. |
| `sidebar-active` | `{accent}` | `{accent}` | Current page or course in the sidebar. |
| `sidebar-active-foreground` | `{accent-foreground}` | `{accent-foreground}` | Label of the current sidebar item. |
| `mastery-gray-fg` | `#52525b` | `#b4b4bc` | “Not tested” text on mastery-gray-bg. Always with the dashed-circle icon. |
| `mastery-gray-bg` | `#efeeea` | `#26272d` | “Not tested” badge ground. |
| `mastery-gray-solid` | `#8b8b94` | `#7c7c86` | “Not tested” bar segment and map-node ring (≥ 3:1 on background). |
| `mastery-red-fg` | `#b42318` | `#ff9b8f` | “Needs work” text on mastery-red-bg. Always with the alert-circle icon. |
| `mastery-red-bg` | `#fdecea` | `#3a1d1b` | “Needs work” badge ground; confident-mistake callouts. |
| `mastery-red-solid` | `#d92d20` | `#f0625a` | “Needs work” bar segment and map-node ring. |
| `mastery-amber-fg` | `#8a5300` | `#f5c063` | “Getting there” text on mastery-amber-bg. Always with the ellipsis-circle icon. |
| `mastery-amber-bg` | `#fdf1d8` | `#33280f` | “Getting there” badge ground. |
| `mastery-amber-solid` | `#c07a00` | `#d99a2b` | “Getting there” bar segment and map-node ring. |
| `mastery-green-fg` | `#1d6b3a` | `#7fd49b` | “Mastered” text on mastery-green-bg. Always with the check-circle icon; told apart from red by lightness and icon, not hue alone. |
| `mastery-green-bg` | `#e4f3e8` | `#15301f` | “Mastered” badge ground. |
| `mastery-green-solid` | `#2f8f4e` | `#45b06a` | “Mastered” bar segment and map-node ring. |
| `marker-lost-fg` | `#a3226b` | `#f59ac6` | “I'm lost” marker (L): text and flag icon on marker-lost-bg; timeline dots. |
| `marker-lost-bg` | `#fbe9f2` | `#3a1a2b` | “I'm lost” chip ground. |
| `marker-important-fg` | `#0b6b78` | `#6fd3df` | “Important” marker (I): text and star icon on marker-important-bg; timeline dots. |
| `marker-important-bg` | `#e1f3f5` | `#12313a` | “Important” chip ground. |

Aliases in braces (`{sunken}`) resolve to that token in the same theme.

### Type

Families: `display` = Newsreader, ui-serif, Georgia, serif; `ui` = "Source Sans 3", ui-sans-serif, system-ui, sans-serif; `code` = "JetBrains Mono", ui-monospace, SFMono-Regular, monospace.

| Style | Family | Size / line | Weight | Tracking | Usage |
|---|---|---|---|---|---|
| `display-xl` | display | 56px / 60px | 500 | -0.02em | Landing hero headline only (40/44 below 640px). One per page. |
| `display-lg` | display | 40px / 46px | 500 | -0.015em | Landing section titles (30/36 below 640px). |
| `display-md` | display | 30px / 36px | 500 | -0.01em | Empty-state and result headlines; landing sub-sections and the final CTA line. |
| `title-lg` | display | 24px / 30px | 500 | -0.01em | App page title (the h1 in PageHeader). One step smaller than today's 30px for a denser workspace. |
| `title-md` | display | 19px / 26px | 500 | 0 | Card and panel titles, the node-panel concept name, stat values. |
| `body-lg` | ui | 17px / 28px | 400 | 0 | Landing lead paragraphs. Max 60ch. |
| `body` | ui | 15px / 24px | 400 | 0 | Reading text: explanations, questions, transcript, descriptions. Max 68ch. |
| `body-sm` | ui | 14px / 20px | 400 | 0 | Dense UI default: nav, buttons, inputs, table cells, sidebar items. |
| `heading` | ui | 15px / 22px | 600 | 0 | Section headings inside a page or card (h2/h3) in sans, where a serif title would be too loud. |
| `label` | ui | 13px / 18px | 600 | 0 | Form labels, badge text, text in compact (sm) controls. |
| `caption` | ui | 12px / 16px | 400 | 0 | Helper text, list meta, footnotes. In muted-foreground. |
| `overline` | ui | 11px / 16px | 600 | 0.08em | Eyebrows above titles and sidebar section labels. Uppercase, muted-foreground. Never for sentences. |
| `mono` | code | 13px / 20px | 400 | 0 | Code in scenarios and transcript excerpts. tabular-nums. |
| `mono-sm` | code | 12px / 16px | 500 | 0 | Timestamps on chips and timelines, keyboard hints (kbd). |

### Spacing

| Token | Value | Usage |
|---|---|---|
| `space-1` | `4px` | Icon-to-label gap in chips and badges. |
| `space-2` | `8px` | Gap inside buttons and between inline controls. |
| `space-3` | `12px` | Sidebar item horizontal padding; gap between a label and its field. |
| `space-4` | `16px` | Card padding on mobile; page side gutter below 640px; gap between list rows. |
| `space-5` | `20px` | Compact card padding (node panel, stat card). |
| `space-6` | `24px` | Card padding; page gutter from 640px; gap between cards in a grid. |
| `space-8` | `32px` | Gap between page sections in the app; page top padding from 1024px. |
| `space-10` | `40px` | PageHeader to first section on wide screens. |
| `space-12` | `48px` | Landing: section title block to its content. |
| `space-16` | `64px` | Landing section padding below 1024px. |
| `space-24` | `96px` | Landing section padding from 1024px. |

### Radius

| Token | Value | Usage |
|---|---|---|
| `radius-sm` | `6px` | Badges, chips, kbd, xs/sm buttons, sidebar items. |
| `radius-md` | `8px` | Buttons, inputs, selects, tabs, menu items. |
| `radius-lg` | `10px` | Cards, panels, dialogs, popovers (the base --radius). |
| `radius-xl` | `14px` | Large feature surfaces: the next-step hero card, landing product frames. |
| `radius-full` | `9999px` | Avatars, marker dots, map-node pills, toggle thumbs. |

### Shadow

| Token | Value | Usage |
|---|---|---|
| `shadow-xs` | `light: 0 1px 2px 0 #1c1d220d<br>dark: 0 1px 2px 0 #00000066` | Outline buttons and inputs only. |
| `shadow-popover` | `light: 0 8px 24px -8px #1c1d2229, 0 2px 6px -2px #1c1d221a<br>dark: 0 8px 24px -8px #00000099, 0 0 0 1px #2c2d34` | Menus, popovers, dialogs, toasts, the mobile sidebar sheet. |
| `shadow-frame` | `light: 0 24px 48px -24px #1c1d2233, 0 0 0 1px #e4e1da<br>dark: 0 24px 48px -24px #000000b3, 0 0 0 1px #2c2d34` | Landing product screenshots in their frame. Nowhere in the app. |

### Layout

| Token | Value | Usage |
|---|---|---|
| `topbar-height` | `56px` | App top bar and landing header; sticky offsets; html scroll-padding-top is 72px (56 + 16). |
| `sidebar-width` | `240px` | Expanded app sidebar (from 1024px). |
| `sidebar-rail` | `56px` | Collapsed sidebar icon rail. |
| `content-max` | `1280px` | Max width of the app content area and the landing container. |
| `reading-max` | `680px` | Max width of reading columns: activities, explanations, legal pages. |
| `panel-width` | `352px` | Right-hand detail column: concept node panel, watch-mode transcript. |
| `target-min` | `24px` | Minimum pointer target (WCAG 2.5.8). Icon buttons 32px, buttons 36px. |

### Z-index

| Token | Value | Usage |
|---|---|---|
| `z-sticky` | `40` | Top bar, sticky panels. |
| `z-overlay` | `50` | Dialogs, sheets, popovers. |
| `z-toast` | `60` | Toasts (sonner). |

Motion tokens (durations and easings) are defined in section 3, under Motion.

### Tailwind utilities

Every token above is a CSS custom property of the same name in `globals.css` (`--input`, `--shadow-popover`, `--topbar-height`, `--duration-fast` …) and is exposed to Tailwind under these names:

| Tokens | Utilities |
|---|---|
| Colour | `bg-` / `text-` / `border-` / `ring-` + the token name: `bg-sidebar`, `bg-sidebar-active`, `text-sidebar-active-foreground`, `text-destructive-foreground`, `border-input`. Mastery and marker `-fg` tokens drop the suffix: `text-mastery-green`, `bg-mastery-green-bg`, `bg-mastery-green-solid`, `text-marker-lost`, `bg-marker-lost-bg`. |
| Type | `text-display-xl`, `text-display-lg`, `text-display-md`, `text-title-lg`, `text-title-md`, `text-body-lg`, `text-body`, `text-body-sm`, `text-heading`, `text-label`, `text-caption`, `text-overline`, `text-mono`, `text-mono-sm`. Each sets family, size, line height, weight and tracking (`text-overline` also uppercases; `text-mono*` use tabular figures; `display-xl`/`display-lg` step down below 640px). `cn()` knows them, so `cn('text-title-lg', 'text-muted-foreground')` keeps both. |
| Spacing, radius | Tailwind's default 4px scale is `space-*` (`gap-4` = `space-4`); `rounded-sm` / `-md` / `-lg` / `-xl` / `-full`. |
| Shadow | `shadow-xs`, `shadow-popover`, `shadow-frame` (per-theme values). |
| Layout | `h-topbar`, `w-sidebar`, `w-sidebar-rail`, `w-panel`, `min-h-target` / `min-w-target`, `max-w-content`, `max-w-reading` (the spacing keys also work with `top-`, `pl-` and so on, e.g. `top-topbar`). |
| Z-index | `z-sticky`, `z-overlay`, `z-toast`. |
| Motion | `duration-fast`, `duration-base`, `duration-slow`, `duration-emphasis`; `ease-out`, `ease-in`, `ease-standard` (these replace Tailwind's default `ease-out` / `ease-in` curves). In Motion code use `duration`, `ease` and `springLayout` from `lib/motion.ts` (seconds; kept in step with the CSS by `lib/motion.test.ts`). |

Dark values are written once under the `theme-dark` custom variant in `globals.css`, which applies them for the `.dark` class and, before hydration or without JS, for `prefers-color-scheme: dark`. `color-scheme` follows the theme, so native controls and scrollbars match.

## 3. UX foundations

How Lectheo behaves: states, loading, feedback, optimistic updates, forms and motion. These rules apply to every screen in the app and on the landing page.

### Response time budget

| Wait | What the student sees |
|---|---|
| < 100 ms | Immediate visual response to the input (pressed state, focus move, optimistic change). |
| 100 ms – 1 s | The control shows it is working (spinner in the button, pending label). Nothing else moves. |
| 1 – 10 s | A pending state with an expectation in words ("Grading takes a few seconds"). The rest of the page stays usable. |
| > 10 s | Progress with stages or a time estimate ("This takes about 15 seconds"), a way to leave and come back, and the result waiting on return. |
| Minutes (lecture processing) | A step list with each step's status, safe to close the page; the dashboard shows the lecture as processing until it is ready. |

Anti-flash rule: don't show a skeleton or spinner for work that finishes in under 300 ms; once shown, keep it at least 400 ms. With TanStack Query, keep previous data on screen during refetches (`placeholderData: keepPreviousData`) instead of swapping in a skeleton. In code: `useDelayedPending(isPending)` from `client/use-delayed-pending.ts` returns whether to show the indicator.

### Loading patterns

| Situation | Pattern | Rules |
|---|---|---|
| First load of a page or route | **Skeleton** in the final layout's shape | `app/(app)/loading.tsx` for route transitions; per-component skeletons while a query is `isPending`. |
| Refetch of data already on screen | **Keep stale content** | No skeleton swap. Optionally a quiet "Updating…" caption. |
| Button action (save, submit, start) | **Inline spinner + verb** in the button | The button keeps its width; the label becomes the pending verb ("Grading…"); `aria-busy` on the form; double submits are blocked. |
| AI grading and replies (2–15 s) | **Pending panel** | Spinner, what is happening and the expected time; in chats a typing indicator in the transcript; the input stays readable (`readOnly`, not `disabled`). |
| Streaming AI text | **Stream in place** | Text appears as it arrives; follow the bottom only if the student is already there. |
| Upload | **Determinate progress bar** | Percentage in text, a Cancel button, a distinct message for each failure type. |
| Lecture processing | **Step list** | Each pipeline step pending, running, done or failed; Retry from the failed step. |

#### Skeletons

- Built from `muted` blocks with the same radius, size and spacing as the content they stand for, so nothing shifts when data arrives (CLS 0).
- Gentle pulse (`animate-pulse`, about 2 s), off under reduced motion. No shimmer gradients.
- One skeleton per region. Keep the real chrome (sidebar, top bar, page title when known) and skeleton only the data.
- Accessibility: the region gets `role="status"` with sr-only text ("Loading your concept map"); the blocks are `aria-hidden`. In code: `<Skeleton />` blocks are `aria-hidden`; give the region's skeleton a `label` (`<Skeleton label="Loading your concept map">…</Skeleton>`) to make it the status region.

#### Spinners

- lucide `LoaderCircle` with `motion-safe:animate-spin`, 16px in buttons and inline, 20px in panels, colour from the text (`currentColor`). In code: `<Spinner />` / `<Spinner size={20} />` from `components/ui/spinner.tsx`.
- Always next to words. Never a page-blocking or full-screen spinner, and never a spinner as the only content of a page.

#### Progress

- Determinate (`Progress`) when the amount is known: uploads, the diagnostic ("Question 3 of 8"), pipeline steps.
- Indeterminate only inside a pending panel with a sentence saying what is happening.

### Optimistic updates

Use optimistic UI when the action is the student's own, very likely to succeed, cheap to reverse, and not graded.

- **Yes:** adding or undoing a marker (L/I), theme and sidebar preferences, the map/list toggle, dismissing a hint.
- **No:** anything graded or AI-generated (submissions, confidence ratings that unlock answers, Stump checks), anything that uses quota, deleting a lecture, resetting the sample account, starting an activity (the server picks the item).

How, with TanStack Query: in `onMutate` cancel the related queries, snapshot the cache and apply the change with `setQueryData`; in `onError` restore the snapshot and show the error with Retry; in `onSettled` invalidate the affected keys (exact keys, not broad prefixes). Every mutation lists the queries it makes stale and invalidates them.

### Feedback and confirmation

- **Undo beats confirm.** A reversible action happens at once and offers Undo in a toast that stays until dismissed or replaced (marker undo must not vanish after 5 s).
- **Confirm only the irreversible** (delete lecture, delete course, delete account, reset sample): a dialog that names the consequence ("This deletes the lecture, its markers and your practice on it."), a `destructive` button that repeats the verb ("Delete lecture"), focus starting on Cancel.
- **Toasts** (sonner; bottom-right on desktop, bottom on mobile) are for confirmations and undo. Errors that need action appear inline next to what failed, with `role="alert"`, and stay until resolved.
- **Success is quiet**: a short confirmation in place ("Saved", the mastery badge changing), except the one signature moment under Motion.

### States every view must have

| State | Content |
|---|---|
| Loading | A skeleton in the final shape. |
| Empty | What will appear here, why it's empty, and one next action ("No lectures yet. Add your first lecture."). |
| Error | What went wrong in plain words; Retry when retrying can work, otherwise a way back. The student's input is kept. |
| Not found / no access | "This page doesn't exist, or you don't have access to it." and "Back to Home". |
| Partial | Show what loaded; mark what didn't, with its own Retry. |
| Success | The content, plus the next step. |

### Forms

- Labels above fields in `label`; helper text below in `caption`, linked with `aria-describedby`.
- Validate on blur, then live once a field has been touched; never on the first keystroke. Errors sit under the field (`aria-invalid`, `aria-describedby`), with a summary on long forms.
- Keep everything typed on any error. Show a character counter from 80 % of a limit.
- Enter submits single-line forms; Ctrl/⌘ + Enter submits textareas. A submit that can't run yet stays focusable (`aria-disabled`) with the reason beside it.

### Navigation and focus

- A route change moves focus to the new page's `<main>` (or a heading the page focuses itself); after a submit, focus moves to the result; after a dialog closes, focus returns to its trigger.
- Browser back always works; a deleted page is replaced in history (`router.replace`), not pushed.
- Links prefetch; route transitions show `loading.tsx` at once.

### Motion

#### Library decision

Recorded as [[Lectheo Tech Stack#ADR-016 · Design system and motion: tokens first, CSS before JavaScript|ADR-016]].

- **CSS first.** Tailwind transitions and `tw-animate-css` (already installed) handle hover, press, focus, colour changes, simple enters, spinners and the skeleton pulse at zero JavaScript cost.
- **Motion** (the `motion` package, `motion/react`, successor to Framer Motion) only where CSS falls short: exit animations (`AnimatePresence`), layout animations (sidebar collapse, list reordering, expanding panels), shared-element indicators (active nav pill, tab underline), number transitions (stat counts) and staggered reveals.
  - Load it lean: `LazyMotion` with the `domAnimation` features loaded asynchronously, and `m.*` components (`import * as m from 'motion/react-m'`) instead of `motion.*`. Measured with Motion 14 and Turbopack, `LazyMotion` + `MotionConfig` alone still cost about 12 kB gzip of first-load JS, so they do not go in the root providers.
  - Wrap only the subtree that animates in `<MotionProvider>` (`components/motion-provider.tsx`: `LazyMotion` strict + `<MotionConfig reducedMotion="user">`), so routes without motion pay nothing and every Motion animation respects the OS setting. Components that animate wrap themselves, as `MasteryBadgeTransition` does.
  - Client components only. Nothing animates on the landing page above the fold before the hero image paints.
- **Not used:** GSAP, react-spring, Lottie, scroll-jacking libraries, and View Transitions (still experimental in Next.js; revisit later).

#### Tokens

| Token | Value | Use |
|---|---|---|
| `duration-fast` | 120 ms | Hover, press, focus, colour and opacity changes. |
| `duration-base` | 180 ms | Menus, popovers, tooltips, toasts, small enters. |
| `duration-slow` | 260 ms | Panels, sheets, sidebar collapse, page content enter. |
| `duration-emphasis` | 400 ms | The signature mastery moment only. |
| `ease-out` | `cubic-bezier(0.16, 1, 0.3, 1)` | Things entering or responding. |
| `ease-in` | `cubic-bezier(0.4, 0, 1, 1)` | Things leaving; exits run at about 70 % of the enter duration. |
| `ease-standard` | `cubic-bezier(0.2, 0, 0, 1)` | Moves between two on-screen states. |
| `spring-layout` | `{ type: 'spring', bounce: 0, duration: 0.3 }` | Motion layout animations. No bounce anywhere. |

Define the durations and easings as CSS custom properties (`--duration-fast`, …, `--ease-out`, …) in `globals.css`, and the same values in a `lib/motion.ts` constants module, so CSS and Motion stay in step.

#### Rules

- Animate only `transform` and `opacity`; Motion's `layout` handles size changes. Keep enter distances small: 4–8px of translate, scale from 0.98.
- Stagger lists by 30 ms, for at most the first 6 items.
- Content is visible at rest. Never leave something at `opacity: 0` waiting for a scroll observer; landing sections may fade up 8px once, after the hero has painted.
- Under `prefers-reduced-motion: reduce`, transitions become instant (the global rule in `globals.css`, plus `MotionConfig` for Motion).
- **Signature moment:** when a concept's mastery changes after practice ([[Lectheo Product Spec#F6. Mastery map — Must|F6]]), the badge cross-fades to the new state and the map node's ring fills over `duration-emphasis`. This is the one place motion celebrates; everywhere else it only explains. In code: `<MasteryBadgeTransition>` (`components/mastery-badge-transition.tsx`) where the state can change in place (node panel, result panels); plain `<MasteryBadge>` everywhere else imports no Motion code.

## 4. App shell

The signed-in product is a workspace: a persistent sidebar to move between courses and lectures, a top bar that says where you are, and a content column that uses the width.

### Structure

- **Sidebar**: `sidebar` ground, a `border` hairline on its right edge, `sidebar-width` wide. It collapses to `sidebar-rail` (icons with tooltips) and remembers that per browser. Below 1024px it becomes an off-canvas sheet opened from a menu button in the top bar, with `shadow-popover`.
  - Top: the wordmark, linking to Home.
  - Primary items: Home (dashboard) and New lecture.
  - "Courses" (`overline` label): the student's own courses, most recent first; sample accounts keep the CS50 library first, and a new Google account's list is empty. The current course expands to list its lectures (number and title, truncated, the full title in a tooltip). The active item uses `sidebar-active` with `sidebar-active-foreground` and `aria-current="page"`.
  - Bottom: an account card (initials, name, "Sample account · deleted in 23 h" when relevant) that opens the account menu: theme, Reset sample, Sign out, Delete account (Google accounts).
  - Items: `body-sm`, `radius-sm`, 32px tall, `space-3` horizontal padding, 16px icons. The active indicator glides between items with a Motion shared layout animation.
- **Top bar**: `topbar-height`, sticky, `background` at 85 % opacity with backdrop blur, a `border` hairline below. Breadcrumbs with real names (Course › Lecture 5 › Spot the flaw) on the left; the page's actions on the right (map/list toggle, Delete lecture). The skip link stays the first focusable element.
- **Content**: `<main id="main" tabIndex={-1}>` centred to `content-max` with the README gutters. Reading content (activities, explanations) is capped at `reading-max` inside it.

### Page anatomy

1. PageHeader: an optional `overline` eyebrow, a `title-lg` h1, a one-line `body-sm` description in `muted-foreground`, and actions on the right (wrapping below on narrow screens). No back link: breadcrumbs replace it.
2. The primary content, with one primary button.
3. Secondary content in sections split by hairlines, not nested cards.

### Key screens

- **Home, first run** ([[Lectheo Product Spec#F0. Accounts, sample account and dashboard — Must|F0.8–F0.9]]; a Google account with no courses): no summary row and no empty cards. One centred `reading-max` block: a `title-lg` "Add your first lecture", three numbered lines (mark, diagnose, practice), what to bring, the time expectation, a primary *Add your first lecture* button and a quiet link to the sample account. After the first lecture is added, the processing step list sits where the next-step card will go.
- **Home (dashboard)**: a summary row of four figures (Mastered, Getting there, Needs work, Confident mistakes) as one card split by hairlines, each with a `caption` label, a tabular `title-md` value and its icon. Then the next-step card (the one hero, `radius-xl`; anatomy below), then courses with a segmented mastery bar each, then recent lectures as rows. No streaks, points or badges.
- **Next-step card** ([[Lectheo Product Spec#F0. Accounts, sample account and dashboard — Must|F0.10–F0.12]]): an `overline` "Next step" with the step's icon; the `reason` as a `title-md` headline; a "Why" list of up to two evidence lines in `body-sm` (each with its icon: flag, star or confident-mistake, and a `▶ 12:41` link when it has a lecture moment); a `caption` row with the estimate and the payoff ("About 5 minutes · One more independent win → Mastered"); the primary action on the right (below on narrow screens). Under the card, **Also worth doing**: up to two hairline-separated rows (mastery badge, concept name, one-line reason, a small outline start button). While a lecture processes, the card becomes the step list (each step pending, running, done or failed), with *Open the map* once the map is ready. In code: `components/dashboard/next-step-card.tsx`, `first-run.tsx`, and the shared `components/lecture/pipeline-steps.tsx`.
- **Course**: map/list toggle in the top bar. The concept map fills the content area, with the node panel as a right column (`panel-width`) rather than an overlay. The list view groups concepts under lecture h2s; each row shows its mastery badge, markers and all four practice actions. *(decided 7 Oct 2026, to be built)* ([[Lectheo Product Spec#F2. Concept map — Must|F2.10–F2.11]]): the map takes the **full content width**; the node panel becomes a right-side **sheet over the map** (`panel-width`, `card`, `shadow-lg`, Esc or ✕ closes, focus returns to the node). **Your markers** moves below the map as a full-width `card`: one track per lecture over the real lecture length, `mono-sm` start and end times under it, 2px `muted-foreground` chapter ticks, dots clamped inside the track.
- **Lecture: Study** ([[Lectheo Product Spec#F9. Study mode — Must|F9]]): a segmented **Study \| Watch \| Transcript** control in the top bar. Study is one `reading-max` column: a header (`title-lg` lecture title, a `caption` "6 concepts · about 5 min to read · 45 min of video", **Test me** primary on the right), then one block per concept split by hairlines (no nested cards): `title-md` name with its mastery badge, a `caption` "Builds on: …" link row, the summary in `body-lg`, key points as a list with `▶ 12:41` links, **Watch this part · from 1:42 · 1 min 30 s** (outline, small; the start time so the length doesn't read as a timestamp) that expands an inline 16:9 player in place, and two quiet ghost buttons *I'm lost here* (flag) and *Important* (star) whose pressed state shows the marker colours. The page ends with "Ready? Find out what you misunderstood." and **Test me**. Works well on phones (the switch moves under the top bar below 640px); no progress indicators. In code: `components/lecture/study-view.tsx`, `study-concept.tsx`, `mark-buttons.tsx`, `clip-player.tsx`, `lecture-modes.tsx`.
  - *(decided 7 Oct 2026, to be built)* Redesign ([[Lectheo Product Spec#F9. Study mode — Must|F9.10]]–F9.15). Desktop: a sticky **outline** rail (about 220px, hairline right border) left of the `reading-max` column: chapter number, title and `caption` reading time per row, the section in view in `accent` with a left `primary` bar, concept-free chapters in `muted-foreground`, **Test me** at its foot. Phones: a sticky **Jump to ▾** select under the top bar. **Chapter section:** `caption` "Chapter 2 · 12:40–31:05", `title-lg` title, the chapter summary in `body` `muted-foreground`, then **Play this chapter · 18 min** (outline, small) and the quiet chapter marks; a hairline, then its concepts. Concept-free chapters are one `body-sm` line with **▶ Play** and a disclosure for the summary. **Concept block:** key point times right-aligned in muted `mono-sm`; no chapter line; **Watch from 12:52 · 1 min 30 s**. **Explain in depth · 3 min read** is a ghost disclosure (chevron) under the buttons; open, it is a `sunken` panel (no card) with four `heading` parts: How it works (`body`, `▶` source links inline), Worked example (`code` block, a `caption` "Beyond the lecture" when it is), Common mistakes (a list, each mistake in `font-medium` then why), Connects to (concept links with their relation). It ends with a `caption` "AI-written from the lecture". Any number of disclosures may be open; still only one player at a time.
- **Lecture and watch**: player on the left, transcript on the right (`panel-width`, `sunken`), marker buttons under the player with `kbd` hints. Sticky panels start below the top bar. ([[Lectheo Product Spec#F11. Chapters — Must|F11]]): the side panel has **Transcript \| Chapters** tabs. A chapter row is `mono-sm` time, `heading` title and a `body-sm` description in `muted-foreground`; the current chapter uses `accent` with a left `primary` bar; rows with concepts show quiet *I'm lost* / *Important* icon buttons with tooltips. Chapter ticks on the progress bar are 2px `muted-foreground` marks. *Play this chapter only* is a toggle in the player controls. In code: `chapter-bar.tsx` (the bar under the player, with "Chapter 3 of 8 · title") and `chapters-list.tsx`.
- **Diagnostic and activities**: a centred reading column (`reading-max`), one question or task card at a time, and result panels with "See it on the map" as the primary next step. *(decided 7 Oct 2026, to be built)* ([[Lectheo Product Spec#F3. Adaptive, confidence-rated diagnostic — Must|F3.9–F3.11]]): diagnostic results open with a coverage line (`body` "Tested 6 of 14 concepts" plus a thin segmented bar, tested in `primary`, untested in `muted`) and a compact per-chapter list (`caption` "Chapter 3 · 2 of 3 tested"). When concepts remain untested, **Test the other 8 →** (outline) sits beside "See it on the map"; concepts with no checked question show as `muted-foreground` "No checked question yet".

### Loading and errors in the shell

- On route loading the real sidebar and top bar stay; the content area shows a skeleton (a title bar and two content blocks).
- Not-found pages and errors render inside the content area with the shell intact, so the student can always navigate away.

## 5. Landing page

The public page sells Lectheo to a student in under a minute and to a judge in two. The words are in [[Lectheo Landing Copy]]; positioning and competitors in [[Lectheo Competition]]. Same tokens as the app; more air, larger type, real product imagery.

### Structure

- Container `content-max` with the README gutters; section padding `space-16`, `space-24` from 1024px; title block to content `space-12`.
- **Header**: `topbar-height`, sticky; the wordmark on the left; anchor nav (How it works · Practice · Why Lectheo · FAQ); "Sign in" (ghost) and "Try the sample account" (primary) on the right. On mobile: wordmark, primary button and a menu.
- **Hero**: a `display-xl` headline ("Find what you missed. *Prove* what you know."), a `body-lg` lead in `muted-foreground`, two calls to action (primary: sample account; outline: Continue with Google), a `caption` trust line, and a real product screenshot in a `radius-xl` frame with `shadow-frame`. Height follows content; no full-viewport hero.
- **Sections** alternate text and product imagery. Each has an `overline` eyebrow only when it labels a real category, a `display-lg` title, a `body-lg` lead, then content.
- **Practice** ([[Lectheo Product Spec#F4. Understanding-level practice|F4]]): the four activities as equal cards (`card`, `radius-lg`, hairline border) with an icon, the name, what you do and what it proves. Stump the AI carries a "Beta" badge.
- **Comparison**: a real `<table>` with a caption, the Lectheo column on `accent`, ✓ and — glyphs with text alternatives. It scrolls inside its own container on mobile.
- **FAQ**: native `<details>`/`<summary>` split by hairlines, `heading` summaries, `body` answers.
- **Final call to action**: a `sunken` band, one `display-md` line, the same two buttons.
- **Footer**: a top hairline; product anchors, Privacy, Terms, GitHub, the CS50 credit and © year in `caption`.

### Imagery

Real screenshots of the app only, in light and dark variants that follow the viewer's theme, framed with `radius-xl` and `shadow-frame`. No illustrations, stock photos or invented dashboards.

### Honesty

No testimonials, user counts, university logos, star ratings or pricing that don't exist. Every claim (privacy, grading, deletion times) must match the app, the privacy page and [[Lectheo Product Spec#F8. Trust, privacy and limits — Must|F8]]. Competitors appear only in the comparison table, and only with facts.

### Performance and sharing

Server Components by default; only the sign-in buttons are client components. The hero image is the only `priority` image, and every image has width, height and `sizes`. No Motion above the fold. Ship an Open Graph image (1200×630) in this system's palette with the wordmark.

## 6. Components

### Button

Buttons trigger an action; use exactly one `default` (primary) button per view. Implemented in `apps/web/src/components/ui/button.tsx` (shadcn/ui with cva). The target styles are below.

#### Variants

- `default`: `primary` fill, `primary-foreground` text. The one main action.
- `outline`: `card` fill, `input` border, `shadow-xs`. Secondary actions beside a primary ("Continue with Google").
- `ghost`: no fill until hover (`muted`). Toolbar and sidebar actions, "Sign in" in the landing header.
- `secondary`: `secondary` fill. Quiet alternatives inside cards.
- `destructive`: `destructive` fill, `destructive-foreground` text. Only the confirm button of an irreversible action.
- `link`: `primary` text, underlined on hover. Navigation inside running text.

#### Sizes

`sm` 32px, `default` 36px, `lg` 40px (landing calls to action 44px), `icon` 36px square (`icon-sm` 32px). Label in `body-sm` at 600 (`label` in `sm`); radius `radius-md` (`radius-sm` for `xs` and `sm`).

#### States

- Focus: the global `:focus-visible` outline (solid 2px `ring`, 2px offset, full opacity). The button adds no focus utilities.
- Hover: the fill shifts one step (`primary` at 90 %, `muted`, `accent`); nothing moves.
- Pending: a 16px spinning `LoaderCircle` replaces the leading icon (trailing icons stay), the label becomes the pending verb ("Grading…"), the width stays, `aria-busy="true"`, clicks are ignored. In code: `<Button pending={isPending} pendingLabel="Grading…">Submit</Button>`; both labels share one grid cell so the width holds, and a polite `role="status"` region next to the button announces the pending label. Without `pendingLabel` the width holds only when a leading icon is swapped for the spinner. `pending` is ignored with `asChild`, and a Button with `pendingLabel` can't be an `asChild` target (the status region is its sibling).
- Disabled: 50 % opacity. When the student needs to know why, keep it focusable with `aria-disabled="true"` and show the reason beside it. Both `disabled` and `aria-disabled="true"` get the 50 % treatment.

#### Consumer provides

Children (icon and label, icon `aria-hidden`), `variant`, `size`, `type` inside forms, and `asChild` with a `Link` for navigation.

### Status badges

Mastery badges and marker chips show a concept's state and the student's flags; colour never appears without its icon and words. Implemented in `apps/web/src/components/mastery-badge.tsx`, `mastery-meta.ts` and `marker-counts.tsx`.

#### Mastery badge

- Four states, in order of progress: Mastered (check circle, `mastery-green-*`), Getting there (ellipsis circle, `mastery-amber-*`), Needs work (alert circle, `mastery-red-*`), Not tested (dashed circle, `mastery-gray-*`).
- Badge: `mastery-*-bg` ground, `mastery-*-fg` text and icon, `label` text, `radius-sm`, 24px tall, `space-1` gap. Bars, rings and map nodes use `mastery-*-solid`.
- "Confident mistake" is an extra chip beside Needs work (`mastery-red-*`), written out in full.
- Where the reason matters (results pages), show it as text beside the badge, not only in a tooltip.

#### Marker chip

- "I'm lost" (flag icon, `marker-lost-*`) and "Important" (star icon, `marker-important-*`), with a count ("I'm lost · 2"). Timestamps inside chips use `mono-sm`.

#### Consumer provides

The state or marker kind and, optionally, a count or reason. Never a custom colour.
