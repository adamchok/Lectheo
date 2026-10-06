'use client'

import type { LectureResponse, MarkerKind } from '@lectheo/contracts'
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { preconnect } from 'react-dom'
import { toast } from 'sonner'
import { useMarkerQueue } from '@/client/capture/marker-queue-hook'
import { LocalPlayer } from '@/client/capture/local-player'
import { useMarkerHotkeys } from '@/client/capture/use-marker-hotkeys'
import { WatchPlayer, type WatchPlayerHandle } from '@/client/capture/watch-player'
import { formatTimestamp } from '@/client/format'
import { useMe } from '@/client/queries'
import { errorMessage } from '@/components/error-state'
import { KeyHint } from '@/components/key-hint'
import { PlayerProvider, type PlayerContextValue } from '@/components/player-context'
import { LectureFrame } from './lecture-frame'
import { DoneCta, MARKER_LABELS, MarkerBar } from './watch-markers'
import { TranscriptPanel } from './watch-transcript'

const NO_MEDIA: NonNullable<LectureResponse['media']> = { youtubeId: null, durationMs: null }

/** /lectures/[id]/watch — watch mode (F1 mode A): player, L/I markers, transcript panel. */
export function WatchView({ lectureId }: { lectureId: string }) {
  return (
    <LectureFrame
      lectureId={lectureId}
      section="Watch"
      description={
        <>
          {/* Visible because L / I also work before anything on the page is focused. */}
          <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1 pointer-coarse:hidden">
            <span>Shortcuts:</span>
            <span>
              <KeyHint>L</KeyHint> when you&apos;re lost
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
          <MarkerBar
            canMark={canMark}
            describedBy={loading ? loadingHintId : undefined}
            counts={counts}
            done={done}
            onMark={mark}
            onFinish={finish}
          />
          {loading && (
            <p id={loadingHintId} className="text-caption text-muted-foreground">
              {ready ? 'Getting markers ready…' : 'Loading player…'}
            </p>
          )}
          {!lecture.hasTimestamps && (
            <p className="text-body-sm text-muted-foreground">
              This lecture has no timestamps, so markers are turned off.
            </p>
          )}
          {done && <DoneCta ref={nextStep} lecture={lecture} lost={counts.lost} />}
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
