# Spike F10.1: YouTube transcripts with Gemini

*Run 7 Oct 2026 · script: [`scripts/spikes/youtube-transcripts.ts`](../../scripts/spikes/youtube-transcripts.ts) · raw outputs in `scripts/spikes/out/` (gitignored)*

## Verdict: **PASS**, through a direct Google AI key (not the AI Gateway)

With `gemini-3.8-flash` called directly on Google's API, **2-minute clips** of the YouTube URL
(`videoMetadata` offsets), low media resolution and `H:MM:SS` timestamps, a 60-minute stretch of
CS50 Lecture 3 came back with **5.5 % word errors, 97.3 % of cue times within 5 s (p95 2.6 s), for
$0.42 per hour of video, in 40 seconds**. Every F10.1 target is met on the 60-minute run and on
each of the three 12-minute clips.

Two conditions for the build:

1. **Direct Google key, not the gateway.** The gateway accepts the YouTube URL but drops the clip
   offsets, so every request bills the *whole* video (653k tokens for this 2-hour lecture) and takes
   2–5 minutes; a 3.8-flash request on it timed out at 300 s. 30 chunk requests per hour of video
   would cost ~$7/h and blow the time target. ADR-017 already allows the direct key with its own
   budget.
2. **2-minute chunks, not 10–15.** Inside one request Gemini paces timestamps by speech rather than
   the clock: on a 12-minute request the error grows ~10 s per minute (p95 48–96 s) and it drops
   stretches near the end. F10.5's "10–15 minute chunks" should become 2-minute chunks.

## Measurements against targets

Recommended configuration: `gemini-3.8-flash`, direct API, 2-minute chunks run in parallel,
`MEDIA_RESOLUTION_LOW`, cue times as `H:MM:SS` strings, stitched with the rule below.
Ground truth: CS50's official subtitles (`lecture3.srt`), video `6Svu_ae5ebk`.

| Clip (video time) | Words (model / official) | WER | Drift p50 | Drift p95 | Cues ≤ 5 s | Missing stretches | Cost | $/hour | Wall time |
|---|---|---|---|---|---|---|---|---|---|
| a 1:12:30–1:24:30 (core window) | 2560 / 2547 | 8.1 % | 0.6 s | 3.9 s | 97.8 % | last 21 words of the clip | $0.077 | $0.39 | 12.9 s |
| b 1:36:00–1:48:00 (core window) | 2494 / 2501 | 2.7 % | 0.5 s | 3.1 s | 100 % | none | $0.084 | $0.42 | 18.0 s |
| c 0:15:00–0:27:00 | 2452 / 2413 | 5.0 % | 0.4 s | 2.5 s | 100 % | none | $0.087 | $0.44 | 21.6 s |
| **h 0:05:00–1:05:00 (60 min, 30 chunks)** | 11987 / 11899 | **5.5 %** | **0.5 s** | **2.6 s** | **97.3 %** | one, 61 words (~15 s) at 0:12:46 | **$0.416** | **$0.42** | **39.7 s** |
| **Target (F10.1)** | | < 10 % | | ≤ 5 s | ≥ 95 % | | | ≤ $0.50 | ≈ 5 min / hour |

How it is measured (`score()` in the script): both transcripts are lower-cased, punctuation
stripped, numbers ≤ 20 spelled out; word-level Levenshtein alignment gives WER. Drift is, for each
model cue, the first word that aligns to an official word: model time vs official time (both
interpolated inside their cue). A missing / invented stretch is a run of ≥ 12 unmatched words.
`selftest` checks the scorer (official vs itself = 0 %; a +3 s shifted copy with one minute cut
→ p50 3 s and exactly one missing stretch).

The two "invented" stretches in the 60-minute run (0:33:24, 0:34:00) are **audience questions the
official subtitles leave out**; Gemini transcribed real speech. The one missing stretch is a real
~15 s skip just before a chunk end.

### Everything else tried (same scorer)

| Configuration | Clip(s) | WER | Drift p95 | ≤ 5 s | Notes |
|---|---|---|---|---|---|
| Gateway, `gemini-2.5-flash-lite`, 12-min clip by prompt | a, b, c | 92 % (b) | 2834 s | 0 % | a, c: unparsable JSON; b: timestamps ~45 min off, half the words |
| Gateway, `gemini-3.8-flash`, 12-min clip | a | n/a | n/a | n/a | `408 Gateway request timed out … Headers Timeout Error` after 304 s |
| Direct, 3.8-flash, 12-min clip, integer ms | a, b, c | 8.9 / 19.4 / 11.0 % | 63 / 96 / 48 s | 6 / 6 / 27 % | drift grows ~10 s/min; b drops 407 words at the end |
| Direct, 3.8-flash, 12-min clip, `H:MM:SS` | a | 15.9 % | 66 s | 16 % | same drift, opposite sign |
| Direct, 3.8-flash, one request for the whole hour | h | 21.4 % | 631 s | 2.9 % | 213 s; last ~2,000 words missing |
| Direct, 3.8-flash, 2-min chunks, integer ms (+ linear rescale) | a | 11.3 % | 22 s | 78 % | chunks stop early; rescale helps but can't recover skips |
| Direct, 3.8-flash, 1-min chunks, integer ms (+ rescale) | a | 11.7 % | 6.5 s | 90 % | more boundaries, more skipped tails |
| Direct, `gemini-3.5-flash-lite`, 2-min chunks, integer ms (+ rescale) | a, b, c | 9.2 / 12.2 / 16.4 % | 5.2 / 28 / 20 s | 95 / 70 / 67 % | $0.21/h, ~10 s, but skips stretches |
| Direct, 3.5-flash-lite, 2-min chunks, `H:MM:SS` | a, b, c | 23.5 / 32.5 / 22.5 % | 25 / 78 / 22 s | 60 / 38 / 55 % | worse with stamps |
| **Direct, 3.8-flash, 2-min chunks, `H:MM:SS`** | **a, b, c, h** | **2.7–8.1 %** | **2.5–3.9 s** | **97–100 %** | **recommended** (linear rescale makes no difference here, so it is not in the rule) |

## 1. Gateway support and the request shape

**Gateway (AI SDK 7 + `@ai-sdk/gateway`): works, but can't clip.** The gateway advertises
`supportedUrls: { '*/*': [/.*/] }`, so the AI SDK passes the URL through untouched, and Gemini reads
it:

```ts
await generateText({
  model: gateway('google/gemini-3.8-flash'),
  messages: [{ role: 'user', content: [
    { type: 'file', data: 'https://www.youtube.com/watch?v=6Svu_ae5ebk', mediaType: 'video/mp4' },
    { type: 'text', text: '…' },
  ] }],
  providerOptions: { google: { mediaResolution: 'MEDIA_RESOLUTION_LOW' } },
})
```

But `@ai-sdk/google` (4.0.90) converts a URL file part to `fileData { fileUri, mimeType }` only;
part-level `videoMetadata` is not mapped (only the separate Interactions API has clip options). The
probe proves it: the same request with and without
`providerOptions.google.videoMetadata { startOffset, endOffset }` on the part billed **652,970
input tokens both times**, i.e. the whole 1 h 59 m video (≈ 91 tokens/s at low resolution).
Implicit caching made the repeat cheap ($0.065 → $0.008) but not fast (224 s → 114 s). Gateway
Gemini models tagged `video-input`: 3.5-flash, 3.5-flash-lite, 3.6-flash, 3.7-flash, 3.8-flash,
omni-flash-preview.

**Direct Google API (`GOOGLE_GENERATIVE_AI_API_KEY`): works, and clips.** The shape that passed:

```http
POST https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent
x-goog-api-key: <key>
content-type: application/json
```
```json
{
  "contents": [{ "role": "user", "parts": [
    { "fileData": { "fileUri": "https://www.youtube.com/watch?v=6Svu_ae5ebk", "mimeType": "video/mp4" },
      "videoMetadata": { "startOffset": "4350s", "endOffset": "4470s" } },
    { "text": "Transcribe the speech in this video between 1:12:30 and 1:14:30, verbatim, in English. Return cues of one or two sentences each (about 5–15 seconds). start/end are the timestamps of the video timeline where the cue is spoken, as H:MM:SS. Cover the whole range without gaps; skip nothing; do not summarise. If there is no speech, return an empty cues array." }
  ] }],
  "generationConfig": {
    "mediaResolution": "MEDIA_RESOLUTION_LOW",
    "maxOutputTokens": 65000,
    "responseMimeType": "application/json",
    "responseJsonSchema": { "type": "object", "required": ["cues"], "properties": { "cues": {
      "type": "array", "items": { "type": "object", "required": ["start", "end", "text"],
      "properties": { "start": { "type": "string" }, "end": { "type": "string" }, "text": { "type": "string" } } } } } }
  }
}
```

A 2-minute clip bills ~11k input tokens (vs 653k through the gateway) and returns in ~10–20 s.
Timestamps come back on the whole-video timeline (`"1:12:34"`), not clip-relative; the script
also accepts clip-relative ones. The structured output stays `[{ start, end, text }]` and is
converted to `[{ startMs, endMs, text }]` (`stampCues()`). Asking for integer milliseconds
directly was clearly worse (table above): the model has to do arithmetic on a timeline it sees as
`MM:SS`.

Not available on the direct key: `gemini-2.5-flash-lite` ("no longer available to new users").
Seen once: `503 This model is currently experiencing high demand` → the build needs a retry.

## 2. Accuracy

See the tables. On the recommended setup every clip meets both accuracy targets; the 60-minute run
has WER 5.5 % and p95 drift 2.6 s. Cues are always in order and inside their chunk after
stitching. Caveats: one lecture, one clear speaker with a microphone; the official subtitles are
themselves lightly edited ASR, so a few "errors" are the reference's ("4 loops" for "for loops").

## 3. Cost and speed

| | Recommended (direct, 3.8-flash, 2-min chunks) |
|---|---|
| Tokens per hour of video | 330,570 input (≈ 92/s: video frames at low resolution + audio) + 44,742 output |
| Cost per hour | **$0.42** (Google list price $0.75 / $3.75 per M tokens, output includes thinking tokens) |
| Wall time, one 2-min chunk | p50 17.5 s, max 39.7 s (30 chunks) |
| Wall time, 12-min clip (6 chunks in parallel) | 13–22 s |
| **Wall time, 60-min video (30 chunks in parallel)** | **39.7 s** measured |

Direct-API costs are computed from `usageMetadata` at list price (the direct key has no gateway
cost header); gateway costs come from `providerMetadata.gateway.cost`. Cheaper option for later:
`gemini-3.5-flash-lite` costs $0.21/h but skipped too much speech (WER 12–33 %).

Projection for the build: with a concurrency cap of 10, a 60-minute video is 3 waves of ~20–40 s,
so **about 1–2 minutes**, well inside the ~5-minute target. A 2-hour video (Google tier limit) is
60 chunks, about $0.85.

## 4. Long videos, chunk boundaries and stitching

**One request cannot cover an hour.** One request for 0:05–1:05: 213 s, WER 21.4 %, p95 drift
631 s, and the last ~11 minutes (2,064 words) missing. Even 12-minute requests drift 50–100 s.
Chunking is required, and the chunk must be short (2 minutes; 1 minute was not better).

**At the boundaries** (29 boundaries in the 60-minute run): chunks cut mid-sentence, but the words
continue across the cut, so nothing is lost there. Five boundaries repeated a single word
("lower | lower", "bool | bool", "go | go"). One chunk wrote `1:00:03…` for `0:10:03` (an hour/minute
slip) on 8 cues. Skips happen just before a chunk end (the 0:12:46 stretch).

**Stitching rule** (`stitch()` in the script):

1. Run the chunks `[start, start + 120 s)` in parallel; concatenate their cues in chunk order.
2. Trust a cue if it starts inside its chunk (−1 s / +2 s grace) and not before the previous cue.
3. Otherwise re-time it right after the previous cue at ~350 ms per word, capped at the chunk end
   (fixes the hour/minute slip without losing its text).
4. Drop a chunk's first word if it repeats the previous chunk's last word.

With this rule the 60-minute run went from 95.7 % to 97.3 % of cues within 5 s. For F10.5's checks,
"in order, inside the video, no large gaps" holds after stitching; a chunk with no cues while its
neighbours have speech, or with most cues untrusted, should be retried once.

## 5. Edge cases

Gemini itself refuses none of these, so **every rule in F10.3 must be checked with the Data API
before any AI spend**. 2-minute clip, direct, 3.8-flash, unless noted.

| Case | Video | oEmbed | Data API | Gemini result | Build behaviour |
|---|---|---|---|---|---|
| Embedding disabled | `9vM4p9NN0Ts` (Stanford CS229 lecture) | `401 Unauthorized` | `embeddable: false` | transcribed normally (20 cues) | refuse before AI (F10.3) |
| Age-restricted | `rYH3iwiTGOg` (red band trailer) | 200 | `contentRating.ytRating: ytAgeRestricted` | transcribed normally (42 cues, profanity included); also via gateway | refuse: the embed needs sign-in. **Add to F10.3** |
| Music, no speech | `t_Kd_G7p6ZQ` (piano, 10 min) | 200 | `defaultAudioLanguage: en` (wrong) | `cues: []` (also via gateway) | "We couldn't find speech in this video", refund (F10.5) |
| Non-English lecture | `-rcQxFZ0n9k` (Collège de France, French) | 200 | `defaultAudioLanguage: fr` | transcribed in French | refuse in v1 (English only) |
| Nonexistent id | `aaaaaaaaaaa` | `400 Bad Request` | not returned | `500 Internal error encountered.` | refuse before AI: Gemini's error is opaque |
| Unlisted | none tested | | `privacyStatus: unlisted` (documented) | not tested: no known unlisted id (search never returns them) | allow (F10.3) |

Note that `defaultAudioLanguage` is uploader-set: the music video says `en`. The language rule
should accept `en*` and also fail the pipeline cleanly if the transcript comes back non-English.

## 6. YouTube Data API

`videos.list?part=contentDetails,status,snippet&id=…` (1 quota unit) returns everything F10.3 needs:

| Video | duration | embeddable | privacyStatus | liveBroadcastContent | defaultAudioLanguage | ytRating |
|---|---|---|---|---|---|---|
| `6Svu_ae5ebk` CS50 L3 | PT1H59M36S | true | public | none | en | none |
| `9vM4p9NN0Ts` CS229 | PT1H44M31S | **false** | public | none | en-US | none |
| `rYH3iwiTGOg` trailer | PT2M24S | true | public | none | en | **ytAgeRestricted** |
| `t_Kd_G7p6ZQ` piano | PT10M13S | true | public | none | en | none |
| `-rcQxFZ0n9k` French | PT1H25M30S | true | public | none | **fr** | none |
| `aaaaaaaaaaa` | not returned (private, deleted or bad id) | | | | | |

Live / upcoming status (`liveBroadcastContent: live | upcoming`) and `unlisted` weren't observed on
real videos here; both are documented fields of the same response. `search.list` (100 units) was
used only to find the edge-case videos.

## Recommendation for the build

| Decision | Value |
|---|---|
| Path | Direct Google AI key with its own budget (ADR-017's fallback), REST `generateContent` or any client that sends part-level `videoMetadata`. Not the AI Gateway. |
| Model | `gemini-3.8-flash` |
| Chunk length | **120 s** (`videoMetadata.startOffset/endOffset`), all chunks in parallel, concurrency cap ~10, one retry on 429/503 |
| Media resolution | `MEDIA_RESOLUTION_LOW` |
| Output | JSON schema `{ cues: [{ start: "H:MM:SS", end: "H:MM:SS", text }] }`, converted to ms |
| Stitching | the 4-step rule above |
| Pre-checks (Data API, before spend) | public/unlisted, `embeddable`, not live/upcoming, ≥ 5 min, `defaultAudioLanguage` en*, **not `ytAgeRestricted`**, within tier length |
| Budget | ≈ $0.42 per hour of video; 2-hour max ≈ $0.85 |

Spec changes this implies (not made here; this PR only adds the spike): F10.5 "10–15 minute
chunks" → 2-minute chunks; F10.3 add age-restricted → refused; API Spec / ADR-017: the gateway
can't clip YouTube inputs, so the direct key is the path.

## Spend

| Key | Spend |
|---|---|
| Gateway `dev` key | $0.35 logged (gateway cost header), plus one 3.8-flash request that timed out at 300 s whose cost isn't known (≤ ~$0.50 if billed in full) |
| Direct Google key | $1.84 (list-price estimate from token counts) |
| **Total** | **$2.19 logged, ≤ ~$2.70 worst case**, under the $3 cap |

No database was touched. Reproduce from `scripts/`:

```bash
pnpm exec tsx --env-file=../apps/web/.env.local spikes/youtube-transcripts.ts direct --stamps --chunk 120 --only a,b,c,h
```
