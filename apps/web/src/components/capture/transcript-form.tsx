'use client'

import { useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useId, useState } from 'react'
import { toast } from 'sonner'
import { queryKeys } from '@/client/queries'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { describedBy, RequiredMark, SubmitRow } from './form-parts'
import type { DraftFormProps } from './new-lecture-view'
import {
  fileKey,
  limitMessage,
  MAX_TRANSCRIPT_BYTES,
  NO_TIMESTAMPS_MESSAGE,
  TRUNCATED_MESSAGE,
  uploadTranscript,
} from './upload'
import { useBuildMap } from './use-build-map'

/** How much pasted text goes into the retry key (enough to tell two pastes apart). */
const PASTE_KEY_CHARS = 200

/** Mode D, transcript only (F1.7): .vtt / .srt / .txt file or pasted text, then processing. */
export function TranscriptForm({ missing, createDraft }: DraftFormProps) {
  const buildMap = useBuildMap()
  const queryClient = useQueryClient()
  const [mode, setMode] = useState<'file' | 'paste'>('file')
  const [file, setFile] = useState<File | null>(null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<{ message: string; aboutInput: boolean } | null>(null)
  const id = useId()
  const hasInput = mode === 'file' ? file !== null : text.trim().length > 0
  const blockers = [
    ...missing,
    ...(hasInput ? [] : [mode === 'file' ? 'choose a transcript file' : 'paste the transcript']),
  ]
  const fieldProps = {
    required: true,
    'aria-invalid': error?.aboutInput || undefined,
    'aria-describedby': describedBy(`${id}-help`, error?.aboutInput && `${id}-error`),
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if ((mode === 'file' && !file) || blockers.length > 0 || busy) return
    const input = mode === 'file' && file ? { file } : { text }
    const size = mode === 'file' && file ? file.size : new Blob([text]).size
    if (size > MAX_TRANSCRIPT_BYTES) {
      setError({ message: 'Transcripts can be up to 2 MB.', aboutInput: true })
      return
    }
    const key =
      mode === 'file' && file
        ? fileKey(file)
        : `text:${text.length}:${text.slice(0, PASTE_KEY_CHARS)}`
    setBusy(true)
    setError(null)
    try {
      const lecture = await createDraft({ source: 'transcript', fileKey: key })
      const result = await uploadTranscript(lecture.id, input)
      void queryClient.invalidateQueries({ queryKey: queryKeys.lecture(lecture.id) })
      if (!result.hasTimestamps) toast.info(NO_TIMESTAMPS_MESSAGE)
      if (result.truncated) toast.warning(TRUNCATED_MESSAGE)
      await buildMap.start(lecture.id)
    } catch (err) {
      setError({ message: limitMessage(err), aboutInput: false })
    }
    setBusy(false)
  }

  return (
    <form noValidate onSubmit={(e) => void submit(e)} className="space-y-4">
      <Tabs value={mode} onValueChange={(value) => setMode(value === 'paste' ? 'paste' : 'file')}>
        <TabsList>
          <TabsTrigger value="file">Upload a file</TabsTrigger>
          <TabsTrigger value="paste">Paste text</TabsTrigger>
        </TabsList>
        <TabsContent
          value="file"
          forceMount
          className="space-y-2 pt-2 data-[state=inactive]:hidden"
        >
          <Label htmlFor="transcript-file">
            Transcript (.vtt, .srt or .txt, up to 2 MB) <RequiredMark />
          </Label>
          <Input
            id="transcript-file"
            type="file"
            {...fieldProps}
            accept=".vtt,.srt,.txt"
            onChange={(e) => setFile(e.currentTarget.files?.[0] ?? null)}
          />
        </TabsContent>
        <TabsContent
          value="paste"
          forceMount
          className="space-y-2 pt-2 data-[state=inactive]:hidden"
        >
          <Label htmlFor="transcript-text">
            Transcript text <RequiredMark />
          </Label>
          <Textarea
            id="transcript-text"
            {...fieldProps}
            rows={10}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste the lecture transcript here."
          />
        </TabsContent>
      </Tabs>
      <p id={`${id}-help`} className="text-muted-foreground text-xs">
        Plain text has no timestamps, so markers are off. The map and diagnostic still work. Speaker
        names are removed.
      </p>
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
