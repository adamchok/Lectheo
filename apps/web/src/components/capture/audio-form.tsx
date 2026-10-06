'use client'

import { type FormEvent, useEffect, useId, useRef, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { describedBy, RequiredMark, SubmitRow } from './form-parts'
import type { DraftFormProps } from './new-lecture-view'
import {
  audioContentType,
  audioSizeProblem,
  fileKey,
  isAbort,
  limitMessage,
  uploadAudio,
} from './upload'
import { useBuildMap } from './use-build-map'

/** Mode D, audio (F1.6): signed-URL upload with progress, then processing transcribes it. */
export function AudioForm({ missing, isSample, createDraft }: DraftFormProps) {
  const buildMap = useBuildMap()
  const [file, setFile] = useState<File | null>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<{ message: string; aboutFile: boolean } | null>(null)
  const id = useId()
  const blockers = [...missing, ...(file ? [] : ['choose an audio file'])]
  const upload = useRef<AbortController | null>(null)
  // Leaving the page cancels the upload, so nothing navigates later on its own.
  useEffect(() => () => upload.current?.abort(), [])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!file || blockers.length > 0 || busy) return
    const contentType = audioContentType(file)
    // Checked before the lecture exists, so a rejected file spends no quota.
    const problem = contentType
      ? audioSizeProblem(file.size, isSample)
      : 'Use an mp3, m4a, webm, ogg or wav file.'
    if (problem || !contentType) {
      setError(problem ? { message: problem, aboutFile: true } : null)
      return
    }
    const controller = new AbortController()
    upload.current = controller
    setBusy(true)
    setError(null)
    try {
      const lecture = await createDraft({ source: 'audio', fileKey: fileKey(file) })
      setProgress(0)
      await uploadAudio(lecture.id, file, contentType, setProgress, controller.signal)
      if (controller.signal.aborted) return
      await buildMap.start(lecture.id)
    } catch (err) {
      if (isAbort(err)) return
      setError({ message: limitMessage(err), aboutFile: false })
      setProgress(null)
    }
    setBusy(false)
  }

  return (
    <form noValidate onSubmit={(e) => void submit(e)} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="audio-file">
          Audio file (mp3, m4a, webm, ogg or wav, up to {isSample ? '20' : '50'} MB){' '}
          <RequiredMark />
        </Label>
        <Input
          id="audio-file"
          type="file"
          required
          aria-invalid={error?.aboutFile || undefined}
          aria-describedby={describedBy(`${id}-help`, error?.aboutFile && `${id}-error`)}
          accept="audio/*,.mp3,.m4a,.webm,.ogg,.wav"
          onChange={(e) => setFile(e.currentTarget.files?.[0] ?? null)}
        />
        <p id={`${id}-help`} className="text-muted-foreground text-xs">
          Lectheo transcribes it, then deletes the audio. Without a player there are no markers.
        </p>
      </div>
      {progress !== null && (
        <div className="space-y-1">
          <Progress value={Math.round(progress * 100)} aria-label="Upload progress" />
          <p className="text-muted-foreground text-xs tabular-nums">
            {progress < 1 ? `Uploading… ${Math.round(progress * 100)}%` : 'Uploaded'}
          </p>
          {/* Announce quarters only, not every percent. */}
          <p className="sr-only" role="status">
            {progress < 1 ? `Uploading, ${Math.floor(progress * 4) * 25}%` : 'Uploaded'}
          </p>
        </div>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-destructive text-sm">
          {error.message}
        </p>
      )}
      <SubmitRow blockers={blockers} busy={busy} busyLabel="Uploading…">
        Upload and build my map
      </SubmitRow>
    </form>
  )
}
