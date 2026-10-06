'use client'

import type { LectureStatus } from '@lectheo/contracts'
import { CircleX, Pencil, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useId, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { pluralize } from '@/client/format'
import { POLLING_LECTURE_STATUSES, useDeleteCourse, useRenameCourse } from '@/client/queries'
import { ConfirmDialog } from '@/components/confirm-dialog'
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
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

const TITLE_MAX = 120
const PROCESSING_REASON = 'You can delete this course once its lectures finish processing.'

export interface CourseActionsProps {
  course: { id: string; title: string }
  lectures: readonly { status: LectureStatus }[]
}

/** F0.7: the course page's Rename and Delete course (own courses only). */
export function CourseActions({ course, lectures }: CourseActionsProps) {
  const [renaming, setRenaming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  // The server refuses (409) while a lecture processes; say so before the user confirms.
  const processing = lectures.some((l) => POLLING_LECTURE_STATUSES.includes(l.status))
  return (
    <>
      <Button variant="ghost" onClick={() => setRenaming(true)}>
        <Pencil aria-hidden />
        <span className="max-sm:sr-only">Rename</span>
      </Button>
      {processing ? (
        <ProcessingDeleteButton />
      ) : (
        <Button variant="ghost" onClick={() => setDeleting(true)}>
          <Trash2 aria-hidden />
          <span className="max-sm:sr-only">Delete course</span>
        </Button>
      )}
      {/* Mounted per opening, so the field starts from the current title. */}
      {renaming && <RenameCourseDialog course={course} onClose={() => setRenaming(false)} />}
      <DeleteCourseDialog
        course={course}
        lectureCount={lectures.length}
        open={deleting}
        onOpenChange={setDeleting}
      />
    </>
  )
}

/** Focusable, with the reason as its description (same pattern as DeleteLectureButton). */
function ProcessingDeleteButton() {
  const reasonId = useId()
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" aria-disabled="true" aria-describedby={reasonId}>
          <Trash2 aria-hidden />
          <span className="max-sm:sr-only">Delete course</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>{PROCESSING_REASON}</TooltipContent>
      <span id={reasonId} className="sr-only">
        {PROCESSING_REASON}
      </span>
    </Tooltip>
  )
}

function RenameCourseDialog({
  course,
  onClose,
}: {
  course: CourseActionsProps['course']
  onClose: () => void
}) {
  const rename = useRenameCourse(course.id)
  const [title, setTitle] = useState(course.title)
  const [blank, setBlank] = useState(false)
  const inputId = useId()
  const errorId = useId()
  const error = blank
    ? 'Enter a course name.'
    : rename.isError
      ? `Couldn't rename the course. ${errorMessage(rename.error)}`
      : null

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const next = title.trim()
    if (!next) return setBlank(true)
    if (next === course.title) return onClose()
    rename.mutate(next, { onSuccess: onClose })
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !rename.isPending && onClose()}>
      <DialogContent showCloseButton={!rename.isPending}>
        <form onSubmit={submit} noValidate className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Rename course</DialogTitle>
            <DialogDescription>Only you see this name.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor={inputId}>Course name</Label>
            <Input
              id={inputId}
              value={title}
              onChange={(event) => {
                setTitle(event.target.value)
                setBlank(false)
              }}
              maxLength={TITLE_MAX}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
            />
          </div>
          {error && (
            <p id={errorId} role="alert" className="text-body-sm text-destructive flex gap-2">
              <CircleX aria-hidden className="mt-0.5 size-4 shrink-0" />
              {error}
            </p>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={rename.isPending}>
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" pending={rename.isPending} pendingLabel="Saving…">
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Confirm text for deleting a course: names what goes with it (F0.7). */
export function deleteCourseConsequence(lectureCount: number): string {
  return `This deletes its ${pluralize(lectureCount, 'lecture')}, the concept map, and your marks and practice in it. It can't be undone.`
}

function DeleteCourseDialog({
  course,
  lectureCount,
  open,
  onOpenChange,
}: {
  course: CourseActionsProps['course']
  lectureCount: number
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const remove = useDeleteCourse()
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) remove.reset()
      }}
      title={`Delete “${course.title}”?`}
      description={deleteCourseConsequence(lectureCount)}
      confirmLabel="Delete course"
      pendingLabel="Deleting…"
      icon={<Trash2 aria-hidden />}
      // Stays pending until the navigation lands: a second click would only 404.
      pending={remove.isPending || remove.isSuccess}
      error={remove.isError ? `Couldn't delete the course. ${errorMessage(remove.error)}` : null}
      onConfirm={() =>
        remove.mutate(course.id, {
          onSuccess: () => {
            toast.success('Course deleted')
            // Replace: the deleted course shouldn't stay in history.
            router.replace('/dashboard')
          },
        })
      }
    />
  )
}
