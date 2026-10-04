'use client'

import type { LectureResponse } from '@lectheo/contracts'
import { Trash2 } from 'lucide-react'
import type { Route } from 'next'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
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

/** F8.2: deletes the lecture with its transcript, markers, audio and derived content. */
export function DeleteLectureButton({ lecture }: { lecture: LectureResponse }) {
  const router = useRouter()
  const remove = useDeleteLecture()
  const [open, setOpen] = useState(false)

  const confirm = async () => {
    try {
      await remove.mutateAsync(lecture.id)
      releaseLocalMedia(lecture.id)
      setOpen(false)
      toast.success('Lecture deleted')
      router.push(`/courses/${lecture.courseId}` as Route)
    } catch (error) {
      toast.error("Couldn't delete the lecture", { description: errorMessage(error) })
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
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
