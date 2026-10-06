'use client'

import type { LectureResponse } from '@lectheo/contracts'
import { Trash2 } from 'lucide-react'
import type { Route } from 'next'
import { useRouter } from 'next/navigation'
import { useId, useState } from 'react'
import { toast } from 'sonner'
import { releaseLocalMedia } from '@/client/capture/local-player-registry'
import { useDeleteLecture } from '@/client/queries'
import { errorMessage } from '@/components/error-state'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

const PROCESSING_REASON = 'You can delete this lecture once processing finishes.'

/** F8.2: deletes the lecture with its transcript, markers, audio and derived content. */
export function DeleteLectureButton({ lecture }: { lecture: LectureResponse }) {
  const router = useRouter()
  const remove = useDeleteLecture()
  const [open, setOpen] = useState(false)
  const reasonId = useId()
  // Deleting mid-run would orphan the transcription job and fail the workflow on its FKs.
  const processing = lecture.status === 'processing' || lecture.status === 'map_ready'

  const confirm = async () => {
    try {
      await remove.mutateAsync(lecture.id)
    } catch {
      return // Shown inline in the dialog (remove.error).
    }
    releaseLocalMedia(lecture.id)
    toast.success('Lecture deleted')
    // Replace: the deleted page shouldn't stay in history. Its cache isn't removed by hand
    // (removing it before the navigation settles refetches into a 404); gcTime collects it.
    router.replace(`/courses/${lecture.courseId}` as Route)
  }

  if (processing) {
    // Focusable, with the reason as its description, instead of a dialog that says "wait".
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" aria-disabled="true" aria-describedby={reasonId}>
            <Trash2 aria-hidden />
            Delete
          </Button>
        </TooltipTrigger>
        <TooltipContent>{PROCESSING_REASON}</TooltipContent>
        <span id={reasonId} className="sr-only">
          {PROCESSING_REASON}
        </span>
      </Tooltip>
    )
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) remove.reset()
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost">
          <Trash2 aria-hidden />
          Delete
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete “{lecture.title}”?</DialogTitle>
          <DialogDescription>
            This removes its transcript, your markers, any uploaded audio, and the concepts and
            questions made from it. Concepts other lectures share stay. This can&apos;t be undone.
          </DialogDescription>
        </DialogHeader>
        {remove.isError && (
          <p role="alert" className="text-body-sm text-destructive">
            Couldn&apos;t delete the lecture. {errorMessage(remove.error)}
          </p>
        )}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button variant="destructive" disabled={remove.isPending} onClick={() => void confirm()}>
            {remove.isPending ? 'Deleting…' : 'Delete lecture'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
