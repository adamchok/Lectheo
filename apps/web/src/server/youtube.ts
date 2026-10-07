import 'server-only'
import {
  YOUTUBE_MIN_DURATION_MS,
  type YoutubePreviewResponse,
  type YoutubeRefusal,
} from '@lectheo/contracts'
import { FAKE_SILENT_VIDEO_ID } from '@lectheo/ai'
import type { Actor } from './auth'
import { appDb, type DbLike } from './db'
import { isAiFake, requireEnv } from './env'
import { ApiError, notFound } from './errors'
import { youtubeLecturesEnabled } from './features'
import { MEDIA_LIMITS, MINUTE_MS, tierOf, type Tier } from './quota'
import { takeRateLimit, YOUTUBE_PREVIEW_LIMIT } from './rate-limit'
import { readCachedTranscript, transcriberKey } from './youtube-cache'

/*
 * YouTube Data API (F10.2–F10.3, ADR-017): every check happens here, before any AI spend, since
 * Gemini refuses none of these videos itself (spike §5). One `videos.list` call (1 quota unit).
 */

const VIDEO_ID = /^[\w-]{11}$/
const YOUTUBE_HOSTS = new Set(['youtube.com', 'youtube-nocookie.com'])
/** Path forms that carry the id: /embed/ID, /shorts/ID, /live/ID, /v/ID, /e/ID. */
const ID_PATHS = new Set(['embed', 'shorts', 'live', 'v', 'e'])
const DATA_API = 'https://www.googleapis.com/youtube/v3/videos'
const DATA_API_TIMEOUT_MS = 10_000
/** videos.list answers are reused this long (the project has 10k Data API units a day). */
const VIDEO_CACHE_MS = 10 * MINUTE_MS

/**
 * The 11-character video id from any link form (watch?v=, youtu.be, &t=, a playlist entry,
 * m./music., embed, shorts) or a bare id; null when there is none (e.g. a playlist-only link).
 */
export function parseYoutubeId(input: string): string | null {
  const raw = input.trim()
  if (VIDEO_ID.test(raw)) return raw
  let url: URL
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`)
  } catch {
    return null
  }
  const host = url.hostname.toLowerCase().replace(/^(www|m|music)\./, '')
  const [, first, second] = url.pathname.split('/')
  let id: string | null | undefined = null
  if (host === 'youtu.be') id = first
  else if (YOUTUBE_HOSTS.has(host)) {
    id = url.searchParams.get('v') ?? (first && ID_PATHS.has(first) ? second : null)
  }
  return id && VIDEO_ID.test(id) ? id : null
}

/** "PT1H59M36S" (ISO 8601, as the Data API sends it) → ms; 0 for live streams ("P0D"). */
export function parseIsoDuration(iso: string): number {
  const m = /^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(iso)
  if (!m) return 0
  const [w = 0, d = 0, h = 0, min = 0, s = 0] = m.slice(1).map((x) => Number(x ?? 0))
  return ((((w * 7 + d) * 24 + h) * 60 + min) * 60 + s) * 1000
}

export interface YoutubeVideo {
  readonly id: string
  readonly title: string
  readonly channel: string
  readonly durationMs: number
  readonly thumbnailUrl: string | null
  readonly privacyStatus: string
  readonly embeddable: boolean
  /** `none` | `live` | `upcoming`. */
  readonly liveBroadcastContent: string
  /** Uploader-set; can be wrong, so the transcript is checked again (F10.3). */
  readonly audioLanguage: string | null
  readonly ageRestricted: boolean
}

export interface YoutubeClient {
  /** null when the Data API doesn't return the video (private, deleted or a bad id). */
  video(id: string): Promise<YoutubeVideo | null>
}

/** The `videos.list` item fields we read. */
export interface DataApiItem {
  id: string
  snippet: {
    title: string
    channelTitle: string
    liveBroadcastContent: string
    defaultAudioLanguage?: string
    defaultLanguage?: string
    thumbnails?: Record<string, { url: string } | undefined>
  }
  contentDetails: { duration: string; contentRating?: { ytRating?: string } }
  status: { privacyStatus: string; embeddable: boolean }
}

export function toVideo(item: DataApiItem): YoutubeVideo {
  const thumbs = item.snippet.thumbnails ?? {}
  return {
    id: item.id,
    title: item.snippet.title,
    channel: item.snippet.channelTitle,
    durationMs: parseIsoDuration(item.contentDetails.duration),
    thumbnailUrl: (thumbs['medium'] ?? thumbs['high'] ?? thumbs['default'])?.url ?? null,
    privacyStatus: item.status.privacyStatus,
    embeddable: item.status.embeddable,
    liveBroadcastContent: item.snippet.liveBroadcastContent,
    // ponytail: falls back to the metadata language when the audio language isn't set.
    audioLanguage: item.snippet.defaultAudioLanguage ?? item.snippet.defaultLanguage ?? null,
    ageRestricted: item.contentDetails.contentRating?.ytRating === 'ytAgeRestricted',
  }
}

/** The real Data API with the server key (sent as a header, never in the URL or logs). */
export function dataApiClient(key: string, fetchImpl: typeof fetch = fetch): YoutubeClient {
  return {
    async video(id) {
      const url = `${DATA_API}?part=contentDetails,status,snippet&id=${encodeURIComponent(id)}`
      const response = await fetchImpl(url, {
        headers: { 'x-goog-api-key': key },
        signal: AbortSignal.timeout(DATA_API_TIMEOUT_MS),
      })
      if (!response.ok) {
        console.warn(JSON.stringify({ event: 'youtube_data_api_failed', status: response.status }))
        throw new ApiError('upstream_unavailable', "We couldn't check this video. Try again.")
      }
      const body = (await response.json()) as { items?: DataApiItem[] }
      const item = body.items?.[0]
      return item ? toVideo(item) : null
    },
  }
}

/** AI_FAKE test videos (e2e, tests): one per refusal; any other id is a 15-minute lecture. */
export const FAKE_VIDEOS: Readonly<Record<string, Partial<YoutubeVideo> | null>> = {
  fakeMissing: null,
  fakePrivate: { privacyStatus: 'private' },
  fakeLiveNow: { liveBroadcastContent: 'live', durationMs: 0 },
  fakeNoEmbed: { embeddable: false },
  fakeAgeGate: { ageRestricted: true },
  fakeTooShrt: { durationMs: 3 * MINUTE_MS },
  fakeTooLong: { durationMs: 3 * 60 * MINUTE_MS },
  fakeLong45m: { durationMs: 45 * MINUTE_MS },
  fakeFrench0: { audioLanguage: 'fr' },
  [FAKE_SILENT_VIDEO_ID]: { title: 'Piano for studying' },
}

export const fakeYoutubeClient: YoutubeClient = {
  async video(id) {
    const override = id in FAKE_VIDEOS ? FAKE_VIDEOS[id] : {}
    if (override === null) return null
    return {
      id,
      title: `Test lecture ${id}`,
      channel: 'Lectheo test channel',
      durationMs: 15 * MINUTE_MS,
      thumbnailUrl: `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
      privacyStatus: 'public',
      embeddable: true,
      liveBroadcastContent: 'none',
      audioLanguage: 'en',
      ageRestricted: false,
      ...override,
    }
  },
}

/** Reuses each answer (found or not) for `ttlMs`, so re-checks of a link cost no quota. */
export function cachedClient(inner: YoutubeClient, ttlMs = VIDEO_CACHE_MS): YoutubeClient {
  const seen = new Map<string, { at: number; video: YoutubeVideo | null }>()
  return {
    async video(id) {
      const hit = seen.get(id)
      if (hit && Date.now() - hit.at < ttlMs) return hit.video
      const video = await inner.video(id)
      seen.set(id, { at: Date.now(), video })
      return video
    },
  }
}

// ponytail: per server instance; a shared cache only if the Data API quota gets tight.
let realClient: YoutubeClient | undefined

/** Fake under AI_FAKE (tests, e2e, offline dev); otherwise the Data API, cached 10 minutes. */
export function youtubeClient(): YoutubeClient {
  if (isAiFake()) return fakeYoutubeClient
  realClient ??= cachedClient(dataApiClient(requireEnv('YOUTUBE_API_KEY')))
  return realClient
}

/** F10.3, in order. Public and unlisted pass; the tier caps the length (Google 2 h, sample 20 min). */
export function checkVideo(video: YoutubeVideo | null, tier: Tier): YoutubeRefusal | null {
  if (!video) return 'not_found'
  if (video.privacyStatus === 'private') return 'private'
  if (video.liveBroadcastContent !== 'none') return 'live'
  if (!video.embeddable) return 'embed_disabled'
  if (video.ageRestricted) return 'age_restricted'
  if (video.durationMs < YOUTUBE_MIN_DURATION_MS) return 'too_short'
  if (video.durationMs > MEDIA_LIMITS[tier].maxDurationMs) return 'too_long'
  // No language set isn't a refusal: the transcript itself is checked for English (F10.3).
  const lang = video.audioLanguage?.toLowerCase()
  if (lang && !lang.startsWith('en')) return 'not_english'
  return null
}

/** F10.5: a cached verdict (no speech, not English) refuses the video before any spend. */
export async function cachedRefusal(db: DbLike, videoId: string): Promise<YoutubeRefusal | null> {
  const cached = await readCachedTranscript(db, transcriberKey(videoId))
  return cached?.kind === 'refusal' ? cached.refusal : null
}

export const NOT_A_YOUTUBE_LINK =
  'That isn’t a link to a YouTube video. Copy the link from the video’s page.'

/** The video id from a pasted link, or 422 for anything else. */
export function requireYoutubeId(url: string): string {
  const id = parseYoutubeId(url)
  if (!id) throw new ApiError('unprocessable_input', NOT_A_YOUTUBE_LINK)
  return id
}

/** GET /youtube/preview: the card and the verdict for this account's tier. Rate-limited per user. */
export async function previewVideo(
  actor: Actor,
  url: string,
  client: YoutubeClient = youtubeClient(),
  db: DbLike = appDb(),
): Promise<YoutubePreviewResponse> {
  if (!youtubeLecturesEnabled()) throw notFound()
  if (!(await takeRateLimit(db, `youtube-preview:${actor.userId}`, YOUTUBE_PREVIEW_LIMIT))) {
    throw new ApiError('rate_limited', 'Too many link checks. Try again in a few minutes.')
  }
  const videoId = requireYoutubeId(url)
  const video = await client.video(videoId)
  const reason = checkVideo(video, tierOf(actor)) ?? (await cachedRefusal(db, videoId))
  return {
    videoId,
    title: video?.title ?? null,
    channel: video?.channel ?? null,
    durationMs: video?.durationMs ?? null,
    thumbnailUrl: video?.thumbnailUrl ?? null,
    ok: reason === null,
    ...(reason ? { reason } : {}),
  }
}
