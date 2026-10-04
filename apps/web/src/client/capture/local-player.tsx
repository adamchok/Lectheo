'use client'

import { FileVideo } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  getLocalMedia,
  type LocalMedia,
  matchesImportedMedia,
  registerLocalMedia,
} from './local-player-registry'
import type { WatchPlayerEvents, WatchPlayerProps } from './watch-player'

const frameClass = 'bg-muted relative aspect-video w-full overflow-hidden rounded-xl'

export interface LocalPlayerProps extends WatchPlayerProps {
  lectureId: string
}

/**
 * Import mode player (F1.5): plays the student's own file from an object URL; the file never
 * leaves the device. Same handle as WatchPlayer, so markers work exactly as in watch mode.
 */
export function LocalPlayer({ lectureId, media, ...events }: LocalPlayerProps) {
  const [entry, setEntry] = useState<LocalMedia | undefined>(() => getLocalMedia(lectureId))
  const [lengthMismatch, setLengthMismatch] = useState(false)
  const latest = useRef<WatchPlayerEvents>(events)
  useEffect(() => {
    latest.current = events
  })
  useEffect(() => () => latest.current.onReady(null), [])

  if (!entry) {
    return (
      <RepickMedia
        expectedName={media.localFileName ?? null}
        onPick={(file) => {
          registerLocalMedia(lectureId, file)
          setEntry(getLocalMedia(lectureId))
        }}
      />
    )
  }

  return (
    <div className="space-y-2">
      <div className={`${frameClass} bg-black`}>
        <video
          key={entry.url}
          src={entry.url}
          controls
          playsInline
          preload="metadata"
          className="absolute inset-0 h-full w-full"
          onLoadedMetadata={(e) => {
            const el = e.currentTarget
            const durationMs = Number.isFinite(el.duration) ? Math.round(el.duration * 1000) : null
            setLengthMismatch(
              !matchesImportedMedia(
                { name: entry.file.name, durationMs },
                { durationMs: media.durationMs },
              ),
            )
            latest.current.onReady({
              currentMs: () => Math.round(el.currentTime * 1000),
              seek: (ms) => {
                el.currentTime = ms / 1000
                void el.play().catch(() => undefined)
              },
              pause: () => el.pause(),
            })
          }}
          onPlay={() => latest.current.onPlayingChange(true)}
          onPause={() => latest.current.onPlayingChange(false)}
          onEnded={() => latest.current.onEnded()}
        />
      </div>
      {lengthMismatch && (
        <p role="status" className="text-muted-foreground text-sm">
          This file&apos;s length doesn&apos;t match the transcript, so markers may land at the
          wrong moments.
        </p>
      )}
    </div>
  )
}

function RepickMedia({
  expectedName,
  onPick,
}: {
  expectedName: string | null
  onPick: (file: File) => void
}) {
  const [mismatch, setMismatch] = useState<File | null>(null)
  return (
    <div className={`${frameClass} flex flex-col items-center justify-center gap-4 p-6 text-center`}>
      <FileVideo aria-hidden className="text-muted-foreground size-10" />
      <p className="text-muted-foreground max-w-sm text-sm">
        Your recording stays on this device, so after a reload we need it again.
        {expectedName && (
          <>
            {' '}
            Pick <span className="text-foreground font-medium">{expectedName}</span>.
          </>
        )}
      </p>
      {mismatch ? (
        <div className="space-y-2">
          <p className="text-sm">
            That&apos;s <span className="font-medium">{mismatch.name}</span>, not the file you
            imported.
          </p>
          <div className="flex justify-center gap-2">
            <Button variant="outline" onClick={() => setMismatch(null)}>
              Pick again
            </Button>
            <Button onClick={() => onPick(mismatch)}>Use it anyway</Button>
          </div>
        </div>
      ) : (
        <Button asChild variant="outline">
          <label className="cursor-pointer">
            Choose file
            <input
              type="file"
              accept="video/*,audio/*"
              className="sr-only"
              onChange={(e) => {
                const file = e.currentTarget.files?.[0]
                if (!file) return
                if (matchesImportedMedia({ name: file.name }, { localFileName: expectedName })) {
                  onPick(file)
                } else {
                  setMismatch(file)
                }
              }}
            />
          </label>
        </Button>
      )}
    </div>
  )
}
