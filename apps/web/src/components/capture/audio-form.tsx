'use client'

import { type FormEvent, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
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
export function AudioForm({ ready, isSample, createDraft }: DraftFormProps) {
  const buildMap = useBuildMap()
  const [file, setFile] = useState<File | null>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const upload = useRef<AbortController | null>(null)
  // Leaving the page cancels the upload, so nothing navigates later on its own.
  useEffect(() => () => upload.current?.abort(), [])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!file) return
    const contentType = audioContentType(file)
    // Checked before the lecture exists, so a rejected file spends no quota.
    const problem = contentType
      ? audioSizeProblem(file.size, isSample)
      : 'Use an mp3, m4a, webm, ogg or wav file.'
    if (problem || !contentType) {
      setError(problem)
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
      setError(limitMessage(err))
      setProgress(null)
    }
    setBusy(false)
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="audio-file">
          Audio file (mp3, m4a, webm, ogg or wav, up to {isSample ? '20' : '50'} MB)
        </Label>
        <Input
          id="audio-file"
          type="file"
          accept="audio/*,.mp3,.m4a,.webm,.ogg,.wav"
          onChange={(e) => setFile(e.currentTarget.files?.[0] ?? null)}
        />
        <p className="text-muted-foreground text-xs">
          Lectheo transcribes it, then deletes the audio. Without a player there are no markers.
        </p>
      </div>
      {progress !== null && (
        <div className="space-y-1">
          <Progress value={Math.round(progress * 100)} aria-label="Upload progress" />
          <p className="text-muted-foreground text-xs tabular-nums" aria-live="polite">
            {progress < 1 ? `Uploading… ${Math.round(progress * 100)}%` : 'Uploaded'}
          </p>
        </div>
      )}
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      <Button type="submit" disabled={!ready || busy || !file}>
        {busy ? 'Uploading…' : 'Upload and build my map'}
      </Button>
    </form>
  )
}
