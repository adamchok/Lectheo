import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ACTOR_A, ACTOR_S, createFixture, type Fixture } from './courses/test-fixtures'
import { resetEnvCache } from './env'
import { youtubeLecturesEnabled } from './features'
import {
  cachedClient,
  checkVideo,
  dataApiClient,
  parseIsoDuration,
  parseYoutubeId,
  previewVideo,
  type DataApiItem,
} from './youtube'

vi.mock('server-only', () => ({}))

const ID = '6Svu_ae5ebk'

describe('parseYoutubeId', () => {
  it.each([
    `https://www.youtube.com/watch?v=${ID}`,
    `https://www.youtube.com/watch?v=${ID}&t=4350s`,
    `https://youtu.be/${ID}`,
    `https://youtu.be/${ID}?t=42`,
    `https://www.youtube.com/watch?v=${ID}&list=PLhQjrBD2T383&index=4`,
    `https://m.youtube.com/watch?v=${ID}&feature=share`,
    `https://music.youtube.com/watch?v=${ID}`,
    `https://www.youtube.com/embed/${ID}?start=10`,
    `https://www.youtube-nocookie.com/embed/${ID}`,
    `https://youtube.com/shorts/${ID}`,
    `https://www.youtube.com/live/${ID}?si=abc`,
    `youtube.com/watch?v=${ID}`,
    `  ${ID}  `,
  ])('%s → the video id', (link) => {
    expect(parseYoutubeId(link)).toBe(ID)
  })

  it.each([
    'https://www.youtube.com/playlist?list=PLhQjrBD2T383',
    'https://vimeo.com/123456789',
    `https://youtube.com.evil.example/watch?v=${ID}`,
    'https://www.youtube.com/watch?v=tooShort',
    'https://www.youtube.com/@cs50',
    'not a link at all',
  ])('%s → null', (link) => {
    expect(parseYoutubeId(link)).toBeNull()
  })
})

describe('parseIsoDuration', () => {
  it('reads Data API durations', () => {
    expect(parseIsoDuration('PT1H59M36S')).toBe(7_176_000)
    expect(parseIsoDuration('PT10M13S')).toBe(613_000)
    expect(parseIsoDuration('P0D')).toBe(0)
    expect(parseIsoDuration('P1DT1S')).toBe(86_401_000)
    expect(parseIsoDuration('P1W')).toBe(7 * 86_400_000)
  })
})

interface ItemOptions {
  duration?: string
  embeddable?: boolean
  privacyStatus?: string
  live?: string
  /** Audio language; null = not set. */
  lang?: string | null
  ytRating?: string
}

/** A videos.list item (spike §6, CS50 Lecture 3) with overrides. */
function item(over: ItemOptions): DataApiItem {
  const lang = over.lang === undefined ? 'en' : over.lang
  return {
    id: ID,
    snippet: {
      title: 'CS50x 2026 - Lecture 3 - Algorithms',
      channelTitle: 'CS50',
      liveBroadcastContent: over.live ?? 'none',
      ...(lang ? { defaultAudioLanguage: lang } : {}),
      thumbnails: { medium: { url: `https://i.ytimg.com/vi/${ID}/mqdefault.jpg` } },
    },
    contentDetails: {
      duration: over.duration ?? 'PT1H59M36S',
      ...(over.ytRating ? { contentRating: { ytRating: over.ytRating } } : {}),
    },
    status: { privacyStatus: over.privacyStatus ?? 'public', embeddable: over.embeddable ?? true },
  }
}

/** The fake Data API: answers videos.list with the given items (none = not returned). */
function fakeDataApi(items: DataApiItem[], status = 200) {
  return vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
    Response.json(status === 200 ? { items } : { error: { code: status } }, { status }),
  )
}

const verdict = async (items: DataApiItem[], tier: 'google' | 'sample' = 'google') =>
  checkVideo(await dataApiClient('key', fakeDataApi(items)).video(ID), tier)

describe('F10.3 checks through the (fake) Data API', () => {
  it('passes a public or unlisted, embeddable, English lecture within the tier limit', async () => {
    expect(await verdict([item({})])).toBeNull()
    expect(await verdict([item({ privacyStatus: 'unlisted', lang: 'en-US' })])).toBeNull()
  })

  it('no language set is not a refusal: the transcript is checked for English instead', async () => {
    expect(await verdict([item({ lang: null })])).toBeNull()
  })

  it.each([
    ['not_found', []],
    ['private', [item({ privacyStatus: 'private' })]],
    ['live', [item({ live: 'live', duration: 'P0D' })]],
    ['live', [item({ live: 'upcoming', duration: 'P0D' })]],
    ['embed_disabled', [item({ embeddable: false })]],
    ['age_restricted', [item({ ytRating: 'ytAgeRestricted' })]],
    ['too_short', [item({ duration: 'PT4M59S' })]],
    ['too_long', [item({ duration: 'PT2H0M1S' })]],
    ['not_english', [item({ lang: 'fr' })]],
  ] as const)('%s', async (reason, items) => {
    expect(await verdict([...items])).toBe(reason)
  })

  it('caps sample accounts at 20 minutes', async () => {
    expect(await verdict([item({ duration: 'PT20M' })], 'sample')).toBeNull()
    expect(await verdict([item({ duration: 'PT20M1S' })], 'sample')).toBe('too_long')
  })

  it('sends the key as a header, never in the URL', async () => {
    const fetch = fakeDataApi([item({})])
    await dataApiClient('secret-key', fetch).video(ID)
    const [url, init] = fetch.mock.calls[0] ?? []
    expect(String(url)).not.toContain('secret-key')
    expect(String(url)).toContain('part=contentDetails,status,snippet')
    expect(init?.headers).toEqual({ 'x-goog-api-key': 'secret-key' })
  })

  it('reuses an answer for 10 minutes (Data API quota)', async () => {
    const fetch = fakeDataApi([item({})])
    const client = cachedClient(dataApiClient('key', fetch))
    await client.video(ID)
    await client.video(ID)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('a Data API failure is upstream_unavailable', async () => {
    const client = dataApiClient('key', fakeDataApi([], 403))
    await expect(client.video(ID)).rejects.toMatchObject({ code: 'upstream_unavailable' })
  })
})

describe('previewVideo', () => {
  let f: Fixture
  beforeEach(async () => {
    f = await createFixture()
  })

  it('returns the card and the verdict', async () => {
    const client = dataApiClient('key', fakeDataApi([item({})]))
    expect(await previewVideo(ACTOR_A, `https://youtu.be/${ID}`, client, f.db)).toEqual({
      videoId: ID,
      title: 'CS50x 2026 - Lecture 3 - Algorithms',
      channel: 'CS50',
      durationMs: 7_176_000,
      thumbnailUrl: `https://i.ytimg.com/vi/${ID}/mqdefault.jpg`,
      ok: true,
    })
  })

  it('names the refusal for this account (sample: 20 minutes)', async () => {
    const client = dataApiClient('key', fakeDataApi([item({})]))
    expect(await previewVideo(ACTOR_S, ID, client, f.db)).toMatchObject({
      ok: false,
      reason: 'too_long',
    })
  })

  it('not found: no card, reason only', async () => {
    const client = dataApiClient('key', fakeDataApi([]))
    expect(await previewVideo(ACTOR_A, ID, client, f.db)).toEqual({
      videoId: ID,
      title: null,
      channel: null,
      durationMs: null,
      thumbnailUrl: null,
      ok: false,
      reason: 'not_found',
    })
  })

  it('names a cached verdict (no speech) before any spend', async () => {
    await f.exec(`INSERT INTO youtube_transcripts (video_id, model, prompt_version, duration_ms,
      cues, refusal) VALUES ('${ID}', 'fake', 'transcribe-chunk@2', 1, '[]'::jsonb, 'no_speech')`)
    const client = dataApiClient('key', fakeDataApi([item({})]))
    expect(await previewVideo(ACTOR_A, ID, client, f.db)).toMatchObject({
      ok: false,
      reason: 'no_speech',
    })
  })

  it('422 for a link that is not a YouTube video, without calling the Data API', async () => {
    const fetch = fakeDataApi([item({})])
    await expect(
      previewVideo(ACTOR_A, 'https://vimeo.com/1', dataApiClient('key', fetch), f.db),
    ).rejects.toMatchObject({ code: 'unprocessable_input' })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('rate-limits per user: 30 checks per 10 minutes', async () => {
    const client = dataApiClient('key', fakeDataApi([item({})]))
    for (let i = 0; i < 30; i++) await previewVideo(ACTOR_A, ID, client, f.db)
    await expect(previewVideo(ACTOR_A, ID, client, f.db)).rejects.toMatchObject({
      code: 'rate_limited',
    })
    // Another user is unaffected.
    await expect(previewVideo(ACTOR_S, ID, client, f.db)).resolves.toMatchObject({ videoId: ID })
  })
})

describe('the F10 switch', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    resetEnvCache()
  })
  const env = (vars: Record<string, string>) => {
    for (const [k, v] of Object.entries(vars)) vi.stubEnv(k, v)
    resetEnvCache()
  }

  it('is off unless FEATURE_YOUTUBE_LECTURES=1, and then answers 404', async () => {
    env({ FEATURE_YOUTUBE_LECTURES: '0' })
    expect(youtubeLecturesEnabled()).toBe(false)
    const f = await createFixture()
    await expect(
      previewVideo(ACTOR_A, ID, dataApiClient('k', fakeDataApi([])), f.db),
    ).rejects.toMatchObject({ code: 'not_found' })
  })

  it('outside AI_FAKE, needs both the YouTube and the Gemini key', () => {
    env({
      FEATURE_YOUTUBE_LECTURES: '1',
      AI_FAKE: '0',
      YOUTUBE_API_KEY: 'y',
      GOOGLE_GENERATIVE_AI_API_KEY: '',
    })
    expect(youtubeLecturesEnabled()).toBe(false)
    env({ GOOGLE_GENERATIVE_AI_API_KEY: 'g' })
    expect(youtubeLecturesEnabled()).toBe(true)
  })
})
