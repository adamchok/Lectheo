'use client'

import { youtubeRefusalMessage, type YoutubePreviewResponse } from '@lectheo/contracts'
import { CircleX } from 'lucide-react'
import { type FormEvent, useEffect, useId, useState } from 'react'
import { useYoutubePreview } from '@/client/queries'
import { useDelayedPending } from '@/client/use-delayed-pending'
import { errorMessage } from '@/components/error-state'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { describedBy, RequiredMark, SubmitRow } from './form-parts'
import type { DraftFormProps } from './new-lecture-view'
import { limitMessage } from './upload'
import { useBuildMap } from './use-build-map'

/** Wait this long after typing stops before checking the link. */
const CHECK_DELAY_MS = 400
const MINUTE_MS = 60_000

/** "15 min", "1 h 59 min", "2 hours" (as in the refusal messages). */
function formatLength(ms: number): string {
  const minutes = Math.round(ms / MINUTE_MS)
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m} min`
  if (m > 0) return `${h} h ${m} min`
  return h === 1 ? '1 hour' : `${h} hours`
}

/** The link as it was when typing paused (an empty link clears it at once). */
function useSettled(value: string): string {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(value), value ? CHECK_DELAY_MS : 0)
    return () => window.clearTimeout(timer)
  }, [value])
  return settled
}

interface PreviewCardProps {
  preview: YoutubePreviewResponse
  maxMinutes: number
  /** Id of the refusal text, which the link field points to (`aria-describedby`). */
  refusalId: string
}

function PreviewCard({ preview, maxMinutes, refusalId }: PreviewCardProps) {
  const refusal = preview.reason ? youtubeRefusalMessage(preview.reason, maxMinutes) : null
  const meta = [
    preview.channel,
    preview.durationMs === null ? null : formatLength(preview.durationMs),
  ]
    .filter(Boolean)
    .join(' · ')
  return (
    <div className="flex gap-4 rounded-lg border p-3" data-testid="youtube-preview">
      {preview.thumbnailUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- YouTube's own thumbnail (CSP img-src)
        <img
          src={preview.thumbnailUrl}
          alt=""
          width={160}
          height={90}
          className="bg-muted aspect-video h-auto w-28 shrink-0 self-start rounded-md object-cover sm:w-40"
        />
      )}
      <div className="min-w-0 space-y-1">
        {preview.title && <p className="line-clamp-2 font-medium break-words">{preview.title}</p>}
        {meta && <p className="text-caption text-muted-foreground">{meta}</p>}
        {/* No role="alert": the surrounding live region already announces it. */}
        {refusal && (
          <p id={refusalId} className="text-destructive flex items-start gap-1.5 text-sm">
            <CircleX aria-hidden className="mt-0.5 size-4 shrink-0" />
            {refusal}
          </p>
        )}
      </div>
    </div>
  )
}

/** Mode F, a YouTube link (F10.2–F10.4): check the video, then create and process it. */
export function YoutubeForm({ missing, isSample, createDraft }: DraftFormProps) {
  const buildMap = useBuildMap()
  const [link, setLink] = useState('')
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const id = useId()
  const url = useSettled(link.trim())
  const preview = useYoutubePreview(url)
  const showPending = useDelayedPending(preview.isFetching)
  const maxMinutes = isSample ? 20 : 120
  // The preview is of the link as it was when typing paused; never submit a different one.
  const settled = link.trim() === url && !preview.isFetching
  const video = settled && preview.data?.ok ? preview.data : null
  const refused = settled && Boolean(preview.data?.reason)

  const blockers = [
    ...missing,
    ...(video
      ? []
      : [settled ? 'paste a link to a video that can be added' : 'wait for the link check']),
    ...(consent ? [] : ['confirm you’re using it for your own study']),
  ]

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!video || blockers.length > 0 || busy) return
    setBusy(true)
    setError(null)
    try {
      const lecture = await createDraft({
        source: 'youtube',
        youtubeUrl: link.trim(),
        fileKey: video.videoId,
      })
      await buildMap.start(lecture.id)
    } catch (err) {
      setError(limitMessage(err))
    }
    setBusy(false)
  }

  const linkError = preview.isError ? errorMessage(preview.error) : null
  return (
    <form noValidate onSubmit={(e) => void submit(e)} className="space-y-4" aria-busy={busy}>
      <div className="space-y-2">
        <Label htmlFor="youtube-link">
          YouTube link <RequiredMark />
        </Label>
        <Input
          id="youtube-link"
          type="url"
          inputMode="url"
          autoComplete="off"
          required
          placeholder="https://www.youtube.com/watch?v=…"
          value={link}
          onChange={(e) => {
            setLink(e.target.value)
            setError(null)
          }}
          aria-invalid={Boolean(linkError) || refused || undefined}
          aria-describedby={describedBy(
            `${id}-help`,
            linkError && `${id}-link-error`,
            refused && `${id}-refusal`,
          )}
        />
        <p id={`${id}-help`} className="text-caption text-muted-foreground">
          A public or unlisted lecture in English, 5 minutes to{' '}
          {formatLength(maxMinutes * MINUTE_MS)}. Only the link goes to Google to transcribe it; the
          video is never downloaded.
        </p>
        {linkError && (
          <p id={`${id}-link-error`} role="alert" className="text-destructive text-sm">
            {linkError}
          </p>
        )}
      </div>
      <div aria-live="polite">
        {showPending && !preview.data && (
          <Skeleton label="Checking the video" className="flex gap-4 rounded-lg border p-3">
            <Skeleton className="aspect-video w-28 sm:w-40" />
            <Skeleton className="h-5 flex-1" />
          </Skeleton>
        )}
        {preview.data && (
          <PreviewCard preview={preview.data} maxMinutes={maxMinutes} refusalId={`${id}-refusal`} />
        )}
      </div>
      <div className="flex items-start gap-3 rounded-lg border p-4">
        <Checkbox
          id="youtube-consent"
          required
          checked={consent}
          onCheckedChange={(value) => setConsent(value === true)}
          className="mt-0.5"
        />
        <Label htmlFor="youtube-consent" className="leading-snug font-normal">
          I’m using this video for my own study. <RequiredMark />
        </Label>
      </div>
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      <SubmitRow blockers={blockers} busy={busy} busyLabel="Adding…">
        Add lecture
      </SubmitRow>
    </form>
  )
}
