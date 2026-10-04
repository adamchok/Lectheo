'use client'

import { type FormEvent, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import type { DraftFormProps } from './new-lecture-view'
import {
  limitMessage,
  MAX_TRANSCRIPT_BYTES,
  NO_TIMESTAMPS_MESSAGE,
  TRUNCATED_MESSAGE,
  uploadTranscript,
} from './upload'
import { useBuildMap } from './use-build-map'

/** Mode D, transcript only (F1.7): .vtt / .srt / .txt file or pasted text, then processing. */
export function TranscriptForm({ ready, createDraft }: DraftFormProps) {
  const buildMap = useBuildMap()
  const [mode, setMode] = useState<'file' | 'paste'>('file')
  const [file, setFile] = useState<File | null>(null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const hasInput = mode === 'file' ? file !== null : text.trim().length > 0

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (mode === 'file' && !file) return
    const input = mode === 'file' && file ? { file } : { text }
    const size = mode === 'file' && file ? file.size : new Blob([text]).size
    if (size > MAX_TRANSCRIPT_BYTES) {
      setError('Transcripts can be up to 2 MB.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const lecture = await createDraft('transcript')
      const result = await uploadTranscript(lecture.id, input)
      if (!result.hasTimestamps) toast.info(NO_TIMESTAMPS_MESSAGE)
      if (result.truncated) toast.warning(TRUNCATED_MESSAGE)
      await buildMap.start(lecture.id)
    } catch (err) {
      setError(limitMessage(err))
    }
    setBusy(false)
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-4">
      <Tabs value={mode} onValueChange={(value) => setMode(value === 'paste' ? 'paste' : 'file')}>
        <TabsList>
          <TabsTrigger value="file">Upload a file</TabsTrigger>
          <TabsTrigger value="paste">Paste text</TabsTrigger>
        </TabsList>
        <TabsContent value="file" className="space-y-2 pt-2">
          <Label htmlFor="transcript-file">Transcript (.vtt, .srt or .txt, up to 2 MB)</Label>
          <Input
            id="transcript-file"
            type="file"
            accept=".vtt,.srt,.txt"
            onChange={(e) => setFile(e.currentTarget.files?.[0] ?? null)}
          />
        </TabsContent>
        <TabsContent value="paste" className="space-y-2 pt-2">
          <Label htmlFor="transcript-text">Transcript text</Label>
          <Textarea
            id="transcript-text"
            rows={10}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste the lecture transcript here."
          />
        </TabsContent>
      </Tabs>
      <p className="text-muted-foreground text-xs">
        Plain text has no timestamps, so markers are off. The map and diagnostic still work.
        Speaker names are removed.
      </p>
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      <Button type="submit" disabled={!ready || busy || !hasInput}>
        {busy ? 'Uploading…' : 'Upload and build my map'}
      </Button>
    </form>
  )
}
