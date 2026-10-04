'use client'

import type { Route } from 'next'
import { useRouter } from 'next/navigation'
import { type FormEvent, useState } from 'react'
import { toast } from 'sonner'
import { registerLocalMedia } from '@/client/capture/local-player-registry'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { DraftFormProps } from './new-lecture-view'
import {
  limitMessage,
  MAX_TRANSCRIPT_BYTES,
  readMediaDuration,
  TRUNCATED_MESSAGE,
  uploadTranscript,
} from './upload'

const stripExt = (name: string): string => name.replace(/\.[^.]+$/, '')

/**
 * Mode B (F1.5): a local recording plus its .vtt / .srt. Only the transcript is uploaded; the
 * recording plays from this device in the watch page, where the student marks moments.
 */
export function ImportForm({
  ready,
  createDraft,
  onSuggestTitle,
}: DraftFormProps & { onSuggestTitle: (title: string) => void }) {
  const router = useRouter()
  const [media, setMedia] = useState<File | null>(null)
  const [transcript, setTranscript] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!media || !transcript) return
    if (transcript.size > MAX_TRANSCRIPT_BYTES) {
      setError('Transcripts can be up to 2 MB.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const durationMs = await readMediaDuration(media)
      const lecture = await createDraft('import', { localFileName: media.name, durationMs })
      const result = await uploadTranscript(lecture.id, { file: transcript })
      registerLocalMedia(lecture.id, media)
      if (result.truncated) toast.warning(TRUNCATED_MESSAGE)
      router.push(`/lectures/${lecture.id}/watch` as Route)
    } catch (err) {
      setError(limitMessage(err))
      setBusy(false)
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="import-media">Video or audio file</Label>
        <Input
          id="import-media"
          type="file"
          accept="video/*,audio/*"
          onChange={(e) => {
            const file = e.currentTarget.files?.[0] ?? null
            setMedia(file)
            if (file) onSuggestTitle(stripExt(file.name))
          }}
        />
        <p className="text-muted-foreground text-xs">
          It plays from this device and is never uploaded.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="import-transcript">Transcript (.vtt or .srt, up to 2 MB)</Label>
        <Input
          id="import-transcript"
          type="file"
          accept=".vtt,.srt"
          onChange={(e) => setTranscript(e.currentTarget.files?.[0] ?? null)}
        />
        <p className="text-muted-foreground text-xs">Speaker names are removed when it uploads.</p>
      </div>
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      <Button type="submit" disabled={!ready || busy || !media || !transcript}>
        {busy ? 'Importing…' : 'Import and start watching'}
      </Button>
    </form>
  )
}
