'use client'

import type { LectureMedia } from '@lectheo/contracts'
import { ArrowUpRight, Headphones } from 'lucide-react'
import { useEffect, useRef, useState, type RefObject } from 'react'
import type { z } from 'zod'
import { Button } from '@/components/ui/button'
import { loadYouTubeApi, YT_STATE, type YTPlayer } from './watch-player-youtube'

/** What watch mode needs from whichever player is mounted. Times are lecture/player time in ms. */
export interface WatchPlayerHandle {
  currentMs: () => number
  seek: (ms: number) => void
  pause: () => void
}

export interface WatchPlayerEvents {
  /** Called with the handle once the player can be driven, and with null on unmount. */
  onReady: (handle: WatchPlayerHandle | null) => void
  onPlayingChange: (playing: boolean) => void
  onEnded: () => void
}

export interface WatchPlayerProps extends WatchPlayerEvents {
  media: z.infer<typeof LectureMedia>
  /** The embed's accessible name (default "Lecture video"). */
  title?: string
}

const NOCOOKIE_HOST = 'https://www.youtube-nocookie.com'
/** How far before startMs the first PLAYING position may be before we distrust the timeline. */
const START_SLACK_MS = 30_000
const frameClass = 'bg-muted relative aspect-video w-full overflow-hidden rounded-xl'

/**
 * Watch mode player (F1.4): YouTube embed (youtube-nocookie) clipped to [startMs, endMs]. If the
 * embed is blocked (API script or player error), falls back to the official MP3 on the same
 * timeline (Architecture risk 7); without one (YouTube lectures, F10.7), links to YouTube.
 */
export function WatchPlayer({ media, title = 'Lecture video', ...events }: WatchPlayerProps) {
  const [blocked, setBlocked] = useState(false)
  const latest = useRef<WatchPlayerEvents>(events)
  useEffect(() => {
    latest.current = events
  })

  const startMs = media.startMs ?? 0
  const endMs = media.endMs ?? null
  if (media.youtubeId && !blocked) {
    return (
      <YouTubePlayer
        videoId={media.youtubeId}
        title={title}
        startMs={startMs}
        endMs={endMs}
        events={latest}
        onBlocked={() => setBlocked(true)}
      />
    )
  }
  if (media.fallbackAudioUrl) {
    return (
      <AudioPlayer src={media.fallbackAudioUrl} startMs={startMs} endMs={endMs} events={latest} />
    )
  }
  if (media.youtubeId) {
    // F10.7: a student's YouTube lecture has no audio fallback; YouTube itself may still play it.
    const at = Math.floor(startMs / 1000)
    return (
      <div
        className={`${frameClass} flex flex-col items-center justify-center gap-3 p-6 text-center`}
      >
        <p className="text-muted-foreground text-sm">The video can’t play here.</p>
        <Button asChild variant="outline" size="sm">
          <a
            href={`https://www.youtube.com/watch?v=${media.youtubeId}${at ? `&t=${at}s` : ''}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open on YouTube
            <ArrowUpRight aria-hidden />
          </a>
        </Button>
      </div>
    )
  }
  return (
    <div className={`${frameClass} flex items-center justify-center p-6 text-center`}>
      <p className="text-muted-foreground text-sm">This lecture has no video to play here.</p>
    </div>
  )
}

interface PlayerProps {
  startMs: number
  endMs: number | null
  events: RefObject<WatchPlayerEvents>
}

function YouTubePlayer({
  videoId,
  title,
  startMs,
  endMs,
  events,
  onBlocked,
}: PlayerProps & { videoId: string; title: string; onBlocked: () => void }) {
  const container = useRef<HTMLDivElement>(null)
  const blocked = useRef(onBlocked)
  useEffect(() => {
    blocked.current = onBlocked
  })

  useEffect(() => {
    const root = container.current
    if (!root) return
    // The API replaces its target element with an iframe, so give it one React doesn't own.
    const target = document.createElement('div')
    root.appendChild(target)
    let player: YTPlayer | null = null
    let cancelled = false
    let checkedOnPlay = false
    const unready = () => events.current.onReady(null)
    /*
     * A video shorter than the lecture window is a different cut than the transcript: YouTube
     * would silently play from 0:00 and markers would land on the wrong time. getDuration() can
     * be 0 at onReady, so this runs again on the first PLAYING state.
     */
    const offTimeline = (p: YTPlayer): boolean => {
      const durationMs = p.getDuration() * 1000
      return durationMs > 0 && durationMs < (endMs ?? startMs)
    }

    loadYouTubeApi()
      .then((YT) => {
        if (cancelled) return
        const created: YTPlayer = new YT.Player(target, {
          host: NOCOOKIE_HOST,
          videoId,
          width: '100%',
          height: '100%',
          playerVars: {
            start: Math.floor(startMs / 1000),
            ...(endMs === null ? {} : { end: Math.ceil(endMs / 1000) }),
            rel: 0,
            playsinline: 1,
            origin: window.location.origin,
          },
          events: {
            onReady: () => {
              created.getIframe().title = title
              if (offTimeline(created)) {
                blocked.current()
                return
              }
              events.current.onReady({
                currentMs: () => Math.round(created.getCurrentTime() * 1000),
                seek: (ms) => {
                  created.seekTo(ms / 1000, true)
                  created.playVideo()
                },
                pause: () => created.pauseVideo(),
              })
            },
            onStateChange: ({ data }) => {
              if (data === YT_STATE.PLAYING && !checkedOnPlay) {
                checkedOnPlay = true
                // Also catches an ignored `start` (playing from far before the window).
                const behindMs = startMs - created.getCurrentTime() * 1000
                if (offTimeline(created) || behindMs > START_SLACK_MS) {
                  blocked.current()
                  return
                }
              }
              if (data === YT_STATE.PLAYING) events.current.onPlayingChange(true)
              if (data === YT_STATE.PAUSED) events.current.onPlayingChange(false)
              if (data === YT_STATE.ENDED) {
                events.current.onPlayingChange(false)
                events.current.onEnded()
              }
            },
            // 101 / 150 = embedding disallowed; any error means we can't play it here.
            onError: () => blocked.current(),
          },
        })
        player = created
      })
      .catch(() => {
        if (!cancelled) blocked.current()
      })

    return () => {
      cancelled = true
      player?.destroy()
      target.remove()
      unready()
    }
  }, [videoId, title, startMs, endMs, events])

  return <div ref={container} className={`${frameClass} [&_iframe]:absolute [&_iframe]:inset-0`} />
}

function AudioPlayer({ src, startMs, endMs, events }: PlayerProps & { src: string }) {
  const startApplied = useRef(false)
  // Reaching endMs pauses (timeupdate) and may also fire the native `ended`: report it once per
  // playthrough.
  const ended = useRef(false)
  const end = () => {
    if (ended.current) return
    ended.current = true
    events.current.onEnded()
  }

  useEffect(() => {
    const unready = () => events.current.onReady(null)
    return unready
  }, [events])

  return (
    <div
      className={`${frameClass} flex flex-col items-center justify-center gap-4 p-6 text-center`}
    >
      <Headphones aria-hidden className="text-muted-foreground size-5" />
      <p className="text-muted-foreground max-w-sm text-sm">
        The video can&apos;t play here, so here&apos;s the official lecture audio on the same
        timeline. Markers work the same way.
      </p>
      <audio
        aria-label="Lecture audio"
        controls
        preload="metadata"
        src={src}
        className="w-full max-w-md"
        onLoadedMetadata={(e) => {
          if (startApplied.current) return
          startApplied.current = true
          const el = e.currentTarget
          el.currentTime = startMs / 1000
          // Ready only once startMs is applied, so a marker can't be saved at t = 0.
          events.current.onReady({
            currentMs: () => Math.round(el.currentTime * 1000),
            seek: (ms) => {
              el.currentTime = ms / 1000
              void el.play().catch(() => undefined)
            },
            pause: () => el.pause(),
          })
        }}
        onPlay={() => {
          ended.current = false
          events.current.onPlayingChange(true)
        }}
        onPause={() => events.current.onPlayingChange(false)}
        onTimeUpdate={(e) => {
          if (endMs !== null && e.currentTarget.currentTime * 1000 >= endMs) {
            e.currentTarget.pause()
            end()
          }
        }}
        onEnded={end}
      />
    </div>
  )
}
