'use client'

import { CircleX } from 'lucide-react'
import { useRef, type ReactNode, type RefObject } from 'react'
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

export interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  /** Names the consequence (Design System §3: confirm only the irreversible). */
  description: ReactNode
  /** Repeats the verb: "Delete course". */
  confirmLabel: string
  pendingLabel: string
  icon?: ReactNode
  pending: boolean
  /** Shown inline with role="alert" until the dialog closes or the action is retried. */
  error: string | null
  onConfirm: () => void
  /**
   * Where focus returns on close when the opener is gone (a menu item). Design System:
   * "after a dialog closes, focus returns to its trigger".
   */
  returnFocusTo?: RefObject<HTMLElement | null>
}

/** Confirm for an irreversible action: focus starts on Cancel, the destructive button acts. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  pendingLabel,
  icon,
  pending,
  error,
  onConfirm,
  returnFocusTo,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null)
  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent
        showCloseButton={!pending}
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          cancelRef.current?.focus()
        }}
        onCloseAutoFocus={(event) => {
          if (!returnFocusTo?.current) return
          event.preventDefault()
          returnFocusTo.current.focus()
        }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {error && (
          <p role="alert" className="text-body-sm text-destructive flex items-start gap-2">
            <CircleX aria-hidden className="mt-0.5 size-4 shrink-0" />
            {error}
          </p>
        )}
        <DialogFooter>
          <DialogClose asChild>
            <Button ref={cancelRef} variant="outline" disabled={pending}>
              Cancel
            </Button>
          </DialogClose>
          <Button
            variant="destructive"
            onClick={onConfirm}
            pending={pending}
            pendingLabel={pendingLabel}
          >
            {icon}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
