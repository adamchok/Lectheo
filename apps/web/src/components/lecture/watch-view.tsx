'use client'

import type { LectureResponse, MarkerKind, TranscriptSegmentDto } from '@lectheo/contracts'
import { ArrowRight, Check, Flag, Star } from 'lucide-react'
import type { Route } from 'next'
import Link from 'next/link'
import { memo, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { preconnect } from 'react-dom'
import { toast } from 'sonner'
import type { z } from 'zod'
import { useMarkerQueue } from '@/client/capture/marker-queue-hook'
import { LocalPlayer } from '@/client/capture/local-player'
import { MARKER_SHORTCUTS, useMarkerHotkeys } from '@/client/capture/use-marker-hotkeys'
import { WatchPlayer, type WatchPlayerHandle } from '@/client/capture/watch-player'
import { formatTimestamp } from '@/client/format'
import { useMe, useTranscript } from '@/client/queries'
import { BuildMapCta, MapBuildingNote } from '@/components/capture/build-map-cta'
import { errorMessage } from '@/components/error-state'
import { KeyHint } from '@/components/key-hint'
import { MarkerCounts } from '@/components/marker-counts'
import { PlayerProvider, type PlayerContextValue } from '@/components/player-context'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { LectureFrame } from './lecture-frame'

type Segment = z.infer<typeof TranscriptSegmentDto>

/** How often the transcript highlight follows the playing video. */
const TICK_MS = 500
/** After the student scrolls the transcript, it stops following the video for this long. */
const FOLLOW_PAUSE_MS = 5_000
const NO_MEDIA: NonNullable<LectureResponse['media']> = { youtubeId: null, durationMs: null }
const MARKER_LABELS: Readonly<Record<MarkerKind, string>> = {
  lost: "I'm lost",
  important: 'Important',
}
const MARKER_KINDS: readonly MarkerKind[] = ['lost', 'important']
/**
 * Phones and tablets (Product Spec §7): the marker buttons become a bar that sticks under the
 * top bar while the student scrolls the transcript, with 44px targets. Fine pointers keep the
 * inline row with L / I hints.
 */
const TOUCH_BAR = cn(
  'max-lg:pointer-coarse:sticky max-lg:pointer-coarse:top-topbar max-lg:pointer-coarse:z-sticky',
  'max-lg:pointer-coarse:grid max-lg:pointer-coarse:grid-cols-2',
  'max-lg:pointer-coarse:bg-background max-lg:pointer-coarse:border-b max-lg:pointer-coarse:py-2',
  'max-lg:pointer-coarse:-mx-4 max-lg:pointer-coarse:px-4',
  'sm:max-lg:pointer-coarse:-mx-6 sm:max-lg:pointer-coarse:px-6',
)
const TOUCH_BUTTON = 'max-lg:pointer-coarse:h-11'

/** /lectures/[id]/watch — watch mode (F1 mode A): player, L/I markers, transcript panel. */
export function WatchView({ lectureId }: { lectureId: string }) {
  return (
    <LectureFrame
      lectureId={lectureId}
      section="Watch"
      description={
        <>
          <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1 pointer-coarse:hidden">
            <span>
              Press <KeyHint>L</KeyHint> when you&apos;re lost
            </span>
            <span>
              <KeyHint>I</KeyHint> when something&apos;s important
            </span>
          </span>
          <span className="hidden pointer-coarse:inline">
            Tap I&apos;m lost or Important as you watch.
          </span>
        </>
      }
    >
      {(lecture) => <WatchSession lecture={lecture} />}
    </LectureFrame>
  )
}

function WatchSession({ lecture }: { lecture: LectureResponse }) {
  const me = useMe()
  const queue = useMarkerQueue(lecture.id, me.data?.id)
  const region = useRef<HTMLDivElement>(null)
  const player = useRef<WatchPlayerHandle | null>(null)
  const [ready, setReady] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [counts, setCounts] = useState(lecture.markerCounts)
  const [done, setDone] = useState(false)
  const loadingHintId = useId()
  const { flush } = queue

  if (lecture.source !== 'import') {
    // The embed's API script and iframe: shortens the wait before the marker buttons enable.
    preconnect('https://www.youtube.com')
    preconnect('https://www.youtube-nocookie.com')
  }

  const onReady = useCallback((handle: WatchPlayerHandle | null) => {
    player.current = handle
    setReady(handle !== null)
  }, [])
  const onPlayingChange = useCallback(
    (isPlaying: boolean) => {
      setPlaying(isPlaying)
      if (!isPlaying) flush()
    },
    [flush],
  )
  const onEnded = useCallback(() => {
    setDone(true)
    flush()
  }, [flush])
  const currentMs = useCallback(() => player.current?.currentMs() ?? null, [])

  // The queue is keyed by user, so marking waits for /me.
  const canMark = ready && lecture.hasTimestamps && Boolean(me.data)
  const mark = useCallback(
    (kind: MarkerKind) => {
      const handle = player.current
      if (!handle || !canMark) return
      const tMs = handle.currentMs()
      const id = queue.add(kind, tMs)
      const bump = (by: number) => setCounts((c) => ({ ...c, [kind]: Math.max(0, c[kind] + by) }))
      bump(1)
      // No timeout (WCAG 2.2.1): Undo stays until the student dismisses the toast.
      toast(`Marked: ${MARKER_LABELS[kind]}`, {
        id,
        description: formatTimestamp(tMs),
        duration: Infinity,
        action: {
          label: 'Undo',
          onClick: () =>
            void queue
              .undo(id)
              .then(() => bump(-1))
              .catch((error: unknown) =>
                toast.error("Couldn't undo that marker", { description: errorMessage(error) }),
              ),
        },
      })
    },
    [queue, canMark],
  )
  useMarkerHotkeys(mark, { scope: region, enabled: canMark })

  // "Done watching" unmounts itself: move focus to what comes next, not <body>. Not when the
  // video just ends, since the user may be elsewhere on the page.
  const nextStep = useRef<HTMLDivElement>(null)
  const focusNextStep = useRef(false)
  useEffect(() => {
    if (!done || !focusNextStep.current) return
    focusNextStep.current = false
    nextStep.current?.focus()
  }, [done])

  const finish = () => {
    player.current?.pause()
    flush()
    focusNextStep.current = true
    setDone(true)
  }

  const seek = useCallback((ms: number) => player.current?.seek(ms), [])
  const playerContext = useMemo<PlayerContextValue>(
    () => ({ seek: ready ? seek : null, openTranscript: null }),
    [ready, seek],
  )
  const loading = lecture.hasTimestamps && !canMark

  return (
    <PlayerProvider value={playerContext}>
      {/* Hotkeys listen on this region (player, marker buttons, transcript). Under lg the left
          column dissolves into it, so the touch bar stays stuck over the transcript as well. */}
      <div
        ref={region}
        className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_var(--panel-width)] lg:gap-6"
      >
        <div className="min-w-0 max-lg:contents lg:space-y-4">
          {lecture.source === 'import' ? (
            <LocalPlayer
              lectureId={lecture.id}
              media={lecture.media ?? NO_MEDIA}
              onReady={onReady}
              onPlayingChange={onPlayingChange}
              onEnded={onEnded}
            />
          ) : (
            <WatchPlayer
              media={lecture.media ?? NO_MEDIA}
              onReady={onReady}
              onPlayingChange={onPlayingChange}
              onEnded={onEnded}
            />
          )}
          <div className="flex min-w-0 flex-wrap items-center gap-2 max-lg:pointer-coarse:contents">
            <div className={cn('flex flex-wrap items-center gap-2', TOUCH_BAR)}>
              {MARKER_KINDS.map((kind) => {
                const Icon = kind === 'lost' ? Flag : Star
                return (
                  <Button
                    key={kind}
                    variant="outline"
                    disabled={!canMark}
                    aria-keyshortcuts={MARKER_SHORTCUTS[kind]}
                    aria-describedby={loading ? loadingHintId : undefined}
                    onClick={() => mark(kind)}
                    className={TOUCH_BUTTON}
                  >
                    <Icon
                      aria-hidden
                      className={cn(
                        'fill-current',
                        kind === 'lost' ? 'text-marker-lost' : 'text-marker-important',
                      )}
                    />
                    {MARKER_LABELS[kind]}
                    <KeyHint className="pointer-coarse:hidden">{MARKER_SHORTCUTS[kind]}</KeyHint>
                  </Button>
                )
              })}
              {/* Not a live region: the "Marked: …" toast already announces each marker. */}
              <MarkerCounts
                lost={counts.lost}
                important={counts.important}
                showZero
                className="max-lg:pointer-coarse:col-span-2"
              />
            </div>
            {!done && (
              <Button variant="ghost" className="ml-auto justify-self-start" onClick={finish}>
                <Check aria-hidden />
                Done watching
              </Button>
            )}
          </div>
          {loading && (
            <p id={loadingHintId} className="text-caption text-muted-foreground">
              {ready ? 'Getting markers ready…' : 'Loading player…'}
            </p>
          )}
          {!lecture.hasTimestamps && (
            <p className="text-muted-foreground text-sm">
              This lecture has no timestamps, so markers are turned off.
            </p>
          )}
          {done && (
            <div ref={nextStep} tabIndex={-1} className="rounded-xl">
              {lecture.status === 'ready' ? (
                <DiagnosticCta lectureId={lecture.id} lost={counts.lost} />
              ) : lecture.status === 'processing' || lecture.status === 'map_ready' ? (
                <MapBuildingNote lectureId={lecture.id} />
              ) : (
                <BuildMapCta lectureId={lecture.id} lost={counts.lost} />
              )}
            </div>
          )}
        </div>
        <TranscriptPanel
          lectureId={lecture.id}
          startMs={lecture.media?.startMs ?? 0}
          playing={playing}
          currentMs={currentMs}
          onSeek={ready ? seek : null}
        />
      </div>
    </PlayerProvider>
  )
}

function DiagnosticCta({ lectureId, lost }: { lectureId: string; lost: number }) {
  return (
    <Card className="border-primary/40">
      <CardContent className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <p className="font-medium">Nice work. Now see what actually stuck.</p>
          <p className="text-muted-foreground text-sm">
            {lost > 0
              ? 'A short diagnostic starts with the moments you flagged as lost.'
              : 'A short diagnostic checks the key ideas from this lecture.'}
          </p>
        </div>
        <Button asChild>
          <Link href={`/lectures/${lectureId}/diagnostic` as Route}>
            Take the diagnostic
            <ArrowRight aria-hidden />
          </Link>
        </Button>
      </CardContent>
    </Card>
  )
}

interface TranscriptPanelProps {
  lectureId: string
  startMs: number
  playing: boolean
  /** Player time, or null while no player is ready. */
  currentMs: () => number | null
  onSeek: ((ms: number) => void) | null
}

/** Owns the playback tick, so only the transcript re-renders while the video plays. */
function TranscriptPanel({ lectureId, startMs, playing, currentMs, onSeek }: TranscriptPanelProps) {
  const transcript = useTranscript(lectureId)
  const list = useRef<HTMLOListElement>(null)
  const [nowMs, setNowMs] = useState(startMs)
  const userScrolledAt = useRef(Number.NEGATIVE_INFINITY)
  const activeIdx = transcript.data?.find((s) => s.startMs <= nowMs && nowMs < s.endMs)?.idx

  useEffect(() => {
    const sync = () => {
      const ms = currentMs()
      if (ms !== null) setNowMs(ms)
    }
    // Once on play/pause too, so the highlight lands where playback stopped.
    const first = window.setTimeout(sync, 0)
    const timer = playing ? window.setInterval(sync, TICK_MS) : undefined
    return () => {
      window.clearTimeout(first)
      window.clearInterval(timer)
    }
  }, [playing, currentMs])

  useEffect(() => {
    const el = list.current
    const item = el?.querySelector<HTMLElement>(`[data-idx="${activeIdx}"]`)
    if (!el || !item) return
    // Reading back a few lines shouldn't be yanked away by the next tick.
    if (performance.now() - userScrolledAt.current < FOLLOW_PAUSE_MS) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    el.scrollTo({ top: item.offsetTop - el.clientHeight / 3, behavior: reduce ? 'auto' : 'smooth' })
  }, [activeIdx])

  const markUserScroll = useCallback(() => {
    userScrolledAt.current = performance.now()
  }, [])
  const seek = useCallback(
    (ms: number) => {
      onSeek?.(ms)
      setNowMs(ms)
    },
    [onSeek],
  )

  return (
    <section
      aria-label="Transcript"
      className="bg-card flex max-h-[28rem] min-h-0 min-w-0 flex-col rounded-xl border lg:sticky lg:top-[calc(var(--topbar-height)+1rem)] lg:max-h-[calc(100dvh-var(--topbar-height)-2rem)]"
    >
      <h2 className="border-b px-4 py-3 text-sm font-medium">Transcript</h2>
      {transcript.isPending ? (
        <Skeleton label="Loading the transcript" className="space-y-3 p-4">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-4/6" />
        </Skeleton>
      ) : transcript.isError ? (
        <p className="text-muted-foreground p-4 text-sm">
          Couldn&apos;t load the transcript.{' '}
          <button type="button" className="underline" onClick={() => transcript.refetch()}>
            Retry
          </button>
        </p>
      ) : transcript.data.length === 0 ? (
        <p className="text-muted-foreground p-4 text-sm">No transcript for this lecture yet.</p>
      ) : (
        <ol
          ref={list}
          onWheel={markUserScroll}
          onTouchMove={markUserScroll}
          className="relative min-h-0 flex-1 space-y-1 overflow-y-auto p-2"
        >
          {transcript.data.map((segment) => (
            <TranscriptRow
              key={segment.idx}
              segment={segment}
              active={segment.idx === activeIdx}
              onSeek={onSeek ? seek : null}
            />
          ))}
        </ol>
      )}
    </section>
  )
}

const TranscriptRow = memo(function TranscriptRow({
  segment,
  active,
  onSeek,
}: {
  segment: Segment
  active: boolean
  onSeek: ((ms: number) => void) | null
}) {
  return (
    <li data-idx={segment.idx}>
      <button
        type="button"
        disabled={!onSeek}
        aria-current={active ? 'true' : undefined}
        onClick={() => onSeek?.(segment.startMs)}
        className={cn(
          'enabled:hover:bg-accent w-full rounded-md px-2 py-1.5 text-left text-sm break-words transition-colors',
          active ? 'bg-accent text-foreground' : 'text-muted-foreground',
        )}
      >
        <span className="text-primary mr-2 font-mono text-xs tabular-nums">
          {formatTimestamp(segment.startMs)}
        </span>
        {segment.text}
      </button>
    </li>
  )
})
