'use client'

import { useQueryClient } from '@tanstack/react-query'
import type { Route } from 'next'
import { useRouter } from 'next/navigation'
import { type FormEvent, useId, useState } from 'react'
import { toast } from 'sonner'
import { registerLocalMedia } from '@/client/capture/local-player-registry'
import { queryKeys } from '@/client/queries'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { describedBy, RequiredMark, SubmitRow } from './form-parts'
import type { DraftFormProps } from './new-lecture-view'
import {
  durationProblem,
  fileKey,
  limitMessage,
  MAX_TRANSCRIPT_BYTES,
  probeMedia,
  TRUNCATED_MESSAGE,
  UNPLAYABLE_MESSAGE,
  uploadTranscript,
} from './upload'

const stripExt = (name: string): string => name.replace(/\.[^.]+$/, '')

/** An error, and the field it's about (if any) for aria-invalid. */
interface FormError {
  message: string
  field?: 'media' | 'transcript'
}

/**
 * Mode B (F1.5): a local recording plus its .vtt / .srt. Only the transcript is uploaded; the
 * recording plays from this device in the watch page, where the student marks moments.
 */
export function ImportForm({
  missing,
  isSample,
  createDraft,
  onSuggestTitle,
}: DraftFormProps & { onSuggestTitle: (title: string) => void }) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [media, setMedia] = useState<File | null>(null)
  const [transcript, setTranscript] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<FormError | null>(null)
  const id = useId()
  const blockers = [
    ...missing,
    !media && 'choose a recording',
    !transcript && 'choose a transcript',
  ].filter((step): step is string => Boolean(step))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!media || !transcript || blockers.length > 0 || busy) return
    if (transcript.size > MAX_TRANSCRIPT_BYTES) {
      setError({ message: 'Transcripts can be up to 2 MB.', field: 'transcript' })
      return
    }
    setBusy(true)
    setError(null)
    try {
      // Checked before the lecture exists, so an unplayable or too-long file spends no quota.
      const probe = await probeMedia(media)
      const problem = probe.playable
        ? durationProblem(probe.durationMs, isSample)
        : UNPLAYABLE_MESSAGE
      if (problem) {
        setError({ message: problem, field: 'media' })
        setBusy(false)
        return
      }
      const lecture = await createDraft({
        source: 'import',
        media: { localFileName: media.name, durationMs: probe.durationMs },
        fileKey: `${fileKey(media)}|${fileKey(transcript)}`,
      })
      const result = await uploadTranscript(lecture.id, { file: transcript })
      registerLocalMedia(lecture.id, media)
      void queryClient.invalidateQueries({ queryKey: queryKeys.lecture(lecture.id) })
      if (result.truncated) toast.warning(TRUNCATED_MESSAGE)
      router.push(`/lectures/${lecture.id}/watch` as Route)
    } catch (err) {
      setError({ message: limitMessage(err) })
      setBusy(false)
    }
  }

  return (
    <form noValidate onSubmit={(e) => void submit(e)} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="import-media">
          Video or audio file <RequiredMark />
        </Label>
        <Input
          id="import-media"
          type="file"
          required
          aria-invalid={error?.field === 'media' || undefined}
          aria-describedby={describedBy(
            `${id}-media-help`,
            error?.field === 'media' && `${id}-error`,
          )}
          accept="video/*,audio/*"
          onChange={(e) => {
            const file = e.currentTarget.files?.[0] ?? null
            setMedia(file)
            if (file) onSuggestTitle(stripExt(file.name))
          }}
        />
        <p id={`${id}-media-help`} className="text-muted-foreground text-xs">
          It plays from this device and is never uploaded. MP4 (H.264) or WebM work best.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="import-transcript">
          Transcript (.vtt or .srt, up to 2 MB) <RequiredMark />
        </Label>
        <Input
          id="import-transcript"
          type="file"
          required
          aria-invalid={error?.field === 'transcript' || undefined}
          aria-describedby={describedBy(
            `${id}-transcript-help`,
            error?.field === 'transcript' && `${id}-error`,
          )}
          accept=".vtt,.srt"
          onChange={(e) => setTranscript(e.currentTarget.files?.[0] ?? null)}
        />
        <p id={`${id}-transcript-help`} className="text-muted-foreground text-xs">
          Speaker names are removed when it uploads.
        </p>
      </div>
      {error && (
        <p id={`${id}-error`} role="alert" className="text-destructive text-sm">
          {error.message}
        </p>
      )}
      <SubmitRow blockers={blockers} busy={busy} busyLabel="Importing…">
        Import and start watching
      </SubmitRow>
    </form>
  )
}
