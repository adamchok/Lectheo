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

/** If the API script hasn't loaded by then, the embed is treated as blocked (Arch risk 7). */
const API_TIMEOUT_MS = 10_000

let apiPromise: Promise<YTNamespace> | null = null

/** Loads https://www.youtube.com/iframe_api once. Rejects if blocked or too slow. */
export function loadYouTubeApi(): Promise<YTNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT)
  apiPromise ??= new Promise<YTNamespace>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('YouTube API timed out')), API_TIMEOUT_MS)
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
