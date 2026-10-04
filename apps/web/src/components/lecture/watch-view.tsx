'use client'

import type { LectureResponse, MarkerKind } from '@lectheo/contracts'
import { ArrowRight, CircleCheck, Flag, Star } from 'lucide-react'
import type { Route } from 'next'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useMarkerQueue } from '@/client/capture/marker-queue-hook'
import { LocalPlayer } from '@/client/capture/local-player'
import { useMarkerHotkeys } from '@/client/capture/use-marker-hotkeys'
import { WatchPlayer, type WatchPlayerHandle } from '@/client/capture/watch-player'
import { formatTimestamp } from '@/client/format'
import { useMe, useTranscript } from '@/client/queries'
import { BuildMapCta } from '@/components/capture/build-map-cta'
import { errorMessage } from '@/components/error-state'
import { KeyHint } from '@/components/key-hint'
import { MarkerCounts } from '@/components/marker-counts'
import { PlayerProvider, type PlayerContextValue } from '@/components/player-context'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { LectureFrame } from './lecture-frame'

/** F1.3: undo window for a marker. */
const UNDO_MS = 5_000
/** How often the transcript highlight follows the playing video. */
const TICK_MS = 500
const NO_MEDIA: NonNullable<LectureResponse['media']> = { youtubeId: null, durationMs: null }

/** /lectures/[id]/watch — watch mode (F1 mode A): player, L/I markers, transcript panel. */
export function WatchView({ lectureId }: { lectureId: string }) {
  return (
    <LectureFrame
      lectureId={lectureId}
      section="Watch"
      description={
        <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>
            Press <KeyHint>L</KeyHint> when you&apos;re lost
          </span>
          <span>
            <KeyHint>I</KeyHint> when something&apos;s important
          </span>
        </span>
      }
    >
      {(lecture) => <WatchSession lecture={lecture} />}
    </LectureFrame>
  )
}

function WatchSession({ lecture }: { lecture: LectureResponse }) {
  const me = useMe()
  const queue = useMarkerQueue(lecture.id, me.data?.id)
  const player = useRef<WatchPlayerHandle | null>(null)
  const [ready, setReady] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [nowMs, setNowMs] = useState(lecture.media?.startMs ?? 0)
  const [counts, setCounts] = useState(lecture.markerCounts)
  const [done, setDone] = useState(false)
  const { flush } = queue

  useEffect(() => {
    if (!playing) return
    const timer = window.setInterval(() => {
      if (player.current) setNowMs(player.current.currentMs())
    }, TICK_MS)
    return () => window.clearInterval(timer)
  }, [playing])

  const onReady = useCallback((handle: WatchPlayerHandle | null) => {
    player.current = handle
    setReady(handle !== null)
  }, [])
  const onPlayingChange = useCallback(
    (isPlaying: boolean) => {
      setPlaying(isPlaying)
      if (player.current) setNowMs(player.current.currentMs())
      if (!isPlaying) flush()
    },
    [flush],
  )
  const onEnded = useCallback(() => {
    setDone(true)
    flush()
  }, [flush])

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
      toast(`Marked: ${kind}`, {
        id,
        description: formatTimestamp(tMs),
        duration: UNDO_MS,
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
  useMarkerHotkeys(mark, { enabled: canMark })

  const finish = () => {
    player.current?.pause()
    flush()
    setDone(true)
  }

  const seek = useCallback((ms: number) => player.current?.seek(ms), [])
  const playerContext = useMemo<PlayerContextValue>(
    () => ({ seek: ready ? seek : null, openTranscript: null }),
    [ready, seek],
  )

  return (
    <PlayerProvider value={playerContext}>
      <div className="grid items-start gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="min-w-0 space-y-4">
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
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" disabled={!canMark} onClick={() => mark('lost')}>
              <Flag aria-hidden className="text-marker-lost fill-current" />
              I&apos;m lost <KeyHint>L</KeyHint>
            </Button>
            <Button variant="outline" disabled={!canMark} onClick={() => mark('important')}>
              <Star aria-hidden className="text-marker-important fill-current" />
              Important <KeyHint>I</KeyHint>
            </Button>
            <span aria-live="polite" className="contents">
              <MarkerCounts lost={counts.lost} important={counts.important} showZero />
            </span>
            {!done && (
              <Button variant="ghost" className="ml-auto" onClick={finish}>
                <CircleCheck aria-hidden />
                Done watching
              </Button>
            )}
          </div>
          {!lecture.hasTimestamps && (
            <p className="text-muted-foreground text-sm">
              This lecture has no timestamps, so markers are turned off.
            </p>
          )}
          {done &&
            (lecture.status === 'draft' || lecture.status === 'failed' ? (
              <BuildMapCta lectureId={lecture.id} lost={counts.lost} />
            ) : (
              <DiagnosticCta lectureId={lecture.id} lost={counts.lost} />
            ))}
        </div>
        <TranscriptPanel lectureId={lecture.id} nowMs={nowMs} onSeek={ready ? seek : null} />
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

function TranscriptPanel({
  lectureId,
  nowMs,
  onSeek,
}: {
  lectureId: string
  nowMs: number
  onSeek: ((ms: number) => void) | null
}) {
  const transcript = useTranscript(lectureId)
  const list = useRef<HTMLOListElement>(null)
  const activeIdx = transcript.data?.find((s) => s.startMs <= nowMs && nowMs < s.endMs)?.idx

  useEffect(() => {
    const el = list.current
    const item = el?.querySelector<HTMLElement>(`[data-idx="${activeIdx}"]`)
    if (!el || !item) return
    el.scrollTo({ top: item.offsetTop - el.clientHeight / 3, behavior: 'smooth' })
  }, [activeIdx])

  return (
    <section
      aria-label="Transcript"
      className="bg-card flex max-h-[28rem] min-h-0 flex-col rounded-xl border lg:sticky lg:top-6 lg:max-h-[calc(100vh-8rem)]"
    >
      <h2 className="border-b px-4 py-3 text-sm font-medium">Transcript</h2>
      {transcript.isPending ? (
        <div className="space-y-3 p-4">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-4/6" />
        </div>
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
        <ol ref={list} className="relative min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
          {transcript.data.map((segment) => {
            const active = segment.idx === activeIdx
            return (
              <li key={segment.idx} data-idx={segment.idx}>
                <button
                  type="button"
                  disabled={!onSeek}
                  aria-current={active ? 'true' : undefined}
                  onClick={() => onSeek?.(segment.startMs)}
                  className={cn(
                    'enabled:hover:bg-accent w-full rounded-md px-2 py-1.5 text-left text-sm transition-colors',
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
          })}
        </ol>
      )}
    </section>
  )
}
