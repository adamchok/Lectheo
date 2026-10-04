'use client'

import { type FormEvent, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import type { DraftFormProps } from './new-lecture-view'
import { audioContentType, limitMessage, uploadAudio } from './upload'
import { useBuildMap } from './use-build-map'

/** Mode D, audio (F1.6): signed-URL upload with progress, then processing transcribes it. */
export function AudioForm({ ready, createDraft }: DraftFormProps) {
  const buildMap = useBuildMap()
  const [file, setFile] = useState<File | null>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!file) return
    const contentType = audioContentType(file)
    if (!contentType) {
      setError('Use an mp3, m4a, webm, ogg or wav file.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const lecture = await createDraft('audio')
      setProgress(0)
      await uploadAudio(lecture.id, file, contentType, setProgress)
      await buildMap.start(lecture.id)
    } catch (err) {
      setError(limitMessage(err))
      setProgress(null)
    }
    setBusy(false)
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="audio-file">Audio file (mp3, m4a, webm, ogg or wav)</Label>
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
