'use client'

import type { MeResponse } from '@lectheo/contracts'
import { LogOut, Monitor, Moon, RotateCcw, Sun, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import { useRef, useState, type RefObject } from 'react'
import { toast } from 'sonner'
import { useDeleteAccount, useResetSample, useSignOut } from '@/client/queries'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Spinner } from '@/components/ui/spinner'
import { safeRedirect } from '@/lib/safe-redirect'
import { cn } from '@/lib/utils'
import { errorMessage } from './error-state'

export const SAMPLE_ACCOUNT_LABEL = 'Sample account · progress resets when you leave'

/** F0.6 wording: names the consequence before anything is deleted. */
export const DELETE_ACCOUNT_CONSEQUENCE =
  "This deletes your courses, lectures, marks and practice, and signs you out. It can't be undone."

interface MenuDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The account button: the menu item that opened the dialog is gone when it closes. */
  returnFocusTo?: RefObject<HTMLElement | null>
}

/** Delete account (Google accounts, F0.6): DELETE /me, then the landing page. */
export function DeleteAccountDialog({ open, onOpenChange, returnFocusTo }: MenuDialogProps) {
  const router = useRouter()
  const remove = useDeleteAccount()
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) remove.reset()
      }}
      title="Delete your account?"
      description={DELETE_ACCOUNT_CONSEQUENCE}
      confirmLabel="Delete account"
      pendingLabel="Deleting…"
      icon={<Trash2 aria-hidden />}
      // Stays pending until the navigation lands: a second click would only 401.
      pending={remove.isPending || remove.isSuccess}
      error={remove.isError ? `Couldn't delete your account. ${errorMessage(remove.error)}` : null}
      returnFocusTo={returnFocusTo}
      onConfirm={() =>
        remove.mutate(undefined, {
          onSuccess: () => {
            router.replace('/')
            router.refresh()
          },
        })
      }
    />
  )
}

function ResetSampleDialog({ open, onOpenChange, returnFocusTo }: MenuDialogProps) {
  const reset = useResetSample()
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) reset.reset()
      }}
      title="Reset the sample account?"
      description="Your markers, answers and practice in this sample will be cleared, and you'll start again from the original sample student."
      confirmLabel="Reset sample"
      pendingLabel="Resetting…"
      icon={<RotateCcw aria-hidden />}
      pending={reset.isPending || reset.isSuccess}
      error={reset.isError ? errorMessage(reset.error) : null}
      returnFocusTo={returnFocusTo}
      onConfirm={() =>
        reset.mutate(undefined, {
          // Full navigation so every cached view re-renders from the fresh copy.
          onSuccess: ({ redirect }) => window.location.assign(safeRedirect(redirect)),
        })
      }
    />
  )
}

function initials(name: string | null): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/).slice(0, 2)
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || '?'
}

/** Account card at the bottom of the sidebar; opens theme, Reset sample, Sign out, Delete. */
export function AccountMenu({ me, collapsed = false }: { me: MeResponse; collapsed?: boolean }) {
  const router = useRouter()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [confirmReset, setConfirmReset] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const signOut = useSignOut()
  const { theme, setTheme } = useTheme()
  const name = me.displayName ?? (me.isSample ? 'Sample student' : 'Your account')
  const meta = signOut.isPending ? 'Signing out…' : me.isSample ? 'Sample account' : null

  const handleSignOut = () => {
    signOut.mutate(undefined, {
      onSuccess: () => {
        router.replace('/')
        router.refresh()
      },
      // Stays until dismissed (Design System §3: errors don't vanish on a timer).
      onError: (error) =>
        toast.error("Couldn't sign out", { description: errorMessage(error), duration: Infinity }),
    })
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            ref={triggerRef}
            variant="ghost"
            aria-label={`Account: ${name}`}
            aria-busy={signOut.isPending || undefined}
            className={cn('h-12 w-full justify-start gap-3 px-2', collapsed && 'size-10 justify-center p-0')}
          >
            <span
              aria-hidden
              className="bg-accent text-accent-foreground text-label flex size-8 shrink-0 items-center justify-center rounded-full"
            >
              {signOut.isPending ? <Spinner /> : initials(me.displayName)}
            </span>
            {!collapsed && (
              <span aria-hidden className="min-w-0 text-left">
                <span className="text-body-sm block truncate font-semibold">{name}</span>
                {meta && <span className="text-caption text-muted-foreground block truncate">{meta}</span>}
              </span>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side={collapsed ? 'right' : 'top'} align="start" className="w-72">
          <DropdownMenuLabel className="space-y-0.5 font-normal">
            <p className="text-body-sm truncate font-semibold">{name}</p>
            {me.isSample && <p className="text-caption text-muted-foreground">{SAMPLE_ACCOUNT_LABEL}</p>}
          </DropdownMenuLabel>
          {me.isSample && (
            <DropdownMenuItem onSelect={() => setConfirmReset(true)}>
              <RotateCcw aria-hidden />
              Reset sample
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-caption text-muted-foreground font-normal">
            Theme
          </DropdownMenuLabel>
          <DropdownMenuRadioGroup value={theme ?? 'system'} onValueChange={setTheme}>
            <DropdownMenuRadioItem value="system">
              <Monitor aria-hidden />
              System
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="light">
              <Sun aria-hidden />
              Light
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="dark">
              <Moon aria-hidden />
              Dark
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={handleSignOut} disabled={signOut.isPending}>
            <LogOut aria-hidden />
            Sign out
          </DropdownMenuItem>
          {me.kind === 'google' && (
            <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
              <Trash2 aria-hidden />
              Delete account
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <DeleteAccountDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        returnFocusTo={triggerRef}
      />
      <ResetSampleDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        returnFocusTo={triggerRef}
      />
    </>
  )
}
