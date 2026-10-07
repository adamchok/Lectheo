'use client'

/*
 * Minimal YouTube IFrame Player API surface (https://developers.google.com/youtube/iframe_api_reference).
 * ponytail: hand-typed subset instead of @types/youtube; add methods here as they're needed.
 */

export const YT_STATE = { ENDED: 0, PLAYING: 1, PAUSED: 2 } as const

export interface YTPlayer {
  getCurrentTime: () => number
  /** Seconds; 0 until the video metadata is known. */
  getDuration: () => number
  seekTo: (seconds: number, allowSeekAhead: boolean) => void
  playVideo: () => void
  pauseVideo: () => void
  destroy: () => void
  getIframe: () => HTMLIFrameElement
}

interface YTPlayerOptions {
  host: string
  videoId: string
  width?: string
  height?: string
  playerVars: Record<string, string | number>
  events: {
    onReady?: () => void
    onStateChange?: (event: { data: number }) => void
    onError?: (event: { data: number }) => void
  }
}

interface YTNamespace {
  Player: new (element: HTMLElement, options: YTPlayerOptions) => YTPlayer
}

declare global {
  interface Window {
    YT?: YTNamespace
    onYouTubeIframeAPIReady?: () => void
  }
}

/** Further behind the requested start than this on the first PLAYING: the start was ignored. */
const RESEEK_SLACK_MS = 3_000
/** Still this far behind after the re-seek: a different cut than the transcript; give up. */
const START_SLACK_MS = 30_000

export interface FirstPlay {
  startMs: number
  endMs: number | null
  currentMs: number
  /** 0 while unknown. */
  durationMs: number
  /** We already re-seeked to startMs once. */
  reseeked: boolean
}

/**
 * What to do on the first PLAYING state. The embed can drop both `start` and a seekTo made
 * before playback and play from 0:00, so seek again once. A video shorter than the lecture
 * window (or one still far behind after the re-seek) is a different cut than the transcript.
 */
export function firstPlayCheck(p: FirstPlay): 'ok' | 'reseek' | 'blocked' {
  if (p.durationMs > 0 && p.durationMs < (p.endMs ?? p.startMs)) return 'blocked'
  const behindMs = p.startMs - p.currentMs
  if (behindMs <= RESEEK_SLACK_MS) return 'ok'
  if (!p.reseeked) return 'reseek'
  return behindMs > START_SLACK_MS ? 'blocked' : 'ok'
}

/** If the API script hasn't loaded by then, the embed is treated as blocked (Arch risk 7). */
const API_TIMEOUT_MS = 10_000

let apiPromise: Promise<YTNamespace> | null = null

/** Loads https://www.youtube.com/iframe_api once. Rejects if blocked or too slow. */
export function loadYouTubeApi(): Promise<YTNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT)
  apiPromise ??= new Promise<YTNamespace>((resolve, reject) => {
    const timer = window.setTimeout(
      () => reject(new Error('YouTube API timed out')),
      API_TIMEOUT_MS,
    )
    const previous = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      previous?.()
      window.clearTimeout(timer)
      if (window.YT?.Player) resolve(window.YT)
      else reject(new Error('YouTube API missing'))
    }
    const script = document.createElement('script')
    script.src = 'https://www.youtube.com/iframe_api'
    script.async = true
    script.onerror = () => {
      window.clearTimeout(timer)
      reject(new Error('YouTube API blocked'))
    }
    document.head.appendChild(script)
  }).catch((error: unknown) => {
    apiPromise = null // allow a retry on the next mount
    throw error
  })
  return apiPromise
}
