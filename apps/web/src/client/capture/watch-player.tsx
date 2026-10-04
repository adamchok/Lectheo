'use client'

import type { LectureMedia } from '@lectheo/contracts'
import { Headphones } from 'lucide-react'
import { useEffect, useRef, useState, type RefObject } from 'react'
import type { z } from 'zod'
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
}

const NOCOOKIE_HOST = 'https://www.youtube-nocookie.com'
const frameClass = 'bg-muted relative aspect-video w-full overflow-hidden rounded-xl'

/**
 * Watch mode player (F1.4): YouTube embed (youtube-nocookie) clipped to [startMs, endMs]. If the
 * embed is blocked (API script or player error), falls back to the official MP3 on the same
 * timeline (Architecture risk 7).
 */
export function WatchPlayer({ media, ...events }: WatchPlayerProps) {
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
  return (
    <div className={`${frameClass} flex items-center justify-center p-6 text-center`}>
      <p className="text-muted-foreground text-sm">
        {blocked
          ? 'The video is blocked on this network and there is no audio fallback.'
          : 'This lecture has no video to play here.'}
      </p>
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
  startMs,
  endMs,
  events,
  onBlocked,
}: PlayerProps & { videoId: string; onBlocked: () => void }) {
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
    const unready = () => events.current.onReady(null)

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
              // A video shorter than the lecture window is a different cut than the transcript:
              // YouTube would silently play from 0:00, so markers would land on the wrong time.
              const durationMs = created.getDuration() * 1000
              if (durationMs > 0 && durationMs < (endMs ?? startMs)) {
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
  }, [videoId, startMs, endMs, events])

  return <div ref={container} className={`${frameClass} [&_iframe]:absolute [&_iframe]:inset-0`} />
}

function AudioPlayer({ src, startMs, endMs, events }: PlayerProps & { src: string }) {
  const audio = useRef<HTMLAudioElement>(null)
  const startApplied = useRef(false)

  useEffect(() => {
    const el = audio.current
    if (!el) return
    const unready = () => events.current.onReady(null)
    events.current.onReady({
      currentMs: () => Math.round(el.currentTime * 1000),
      seek: (ms) => {
        el.currentTime = ms / 1000
        void el.play().catch(() => undefined)
      },
      pause: () => el.pause(),
    })
    return unready
  }, [events])

  return (
    <div className={`${frameClass} flex flex-col items-center justify-center gap-4 p-6 text-center`}>
      <Headphones aria-hidden className="text-muted-foreground size-10" />
      <p className="text-muted-foreground max-w-sm text-sm">
        The video can&apos;t play here, so here&apos;s the official lecture audio on the same
        timeline. Markers work the same way.
      </p>
      <audio
        ref={audio}
        controls
        preload="metadata"
        src={src}
        className="w-full max-w-md"
        onLoadedMetadata={(e) => {
          if (startApplied.current) return
          startApplied.current = true
          e.currentTarget.currentTime = startMs / 1000
        }}
        onPlay={() => events.current.onPlayingChange(true)}
        onPause={() => events.current.onPlayingChange(false)}
        onTimeUpdate={(e) => {
          if (endMs !== null && e.currentTarget.currentTime * 1000 >= endMs) {
            e.currentTarget.pause()
            events.current.onEnded()
          }
        }}
        onEnded={() => events.current.onEnded()}
      />
    </div>
  )
}
