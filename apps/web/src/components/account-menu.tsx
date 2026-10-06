'use client'

import type { MeResponse } from '@lectheo/contracts'
import { CircleX, LogOut, Monitor, Moon, RotateCcw, Sun } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import { useState } from 'react'
import { toast } from 'sonner'
import { useResetSample, useSignOut } from '@/client/queries'
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

function initials(name: string | null): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/).slice(0, 2)
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || '?'
}

/** Account card at the bottom of the sidebar; opens theme, Reset sample and Sign out. */
export function AccountMenu({ me, collapsed = false }: { me: MeResponse; collapsed?: boolean }) {
  const router = useRouter()
  const [confirmReset, setConfirmReset] = useState(false)
  const resetSample = useResetSample()
  const signOut = useSignOut()
  const { theme, setTheme } = useTheme()
  const name = me.displayName ?? (me.isSample ? 'Sample student' : 'Your account')
  const meta = signOut.isPending ? 'Signing out…' : me.isSample ? 'Sample account' : null

  const handleReset = () => {
    resetSample.mutate(undefined, {
      onSuccess: ({ redirect }) => {
        // Full navigation so every cached view re-renders from the fresh copy.
        window.location.assign(safeRedirect(redirect))
      },
    })
  }

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
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog
        open={confirmReset}
        onOpenChange={(open) => {
          if (resetSample.isPending) return
          setConfirmReset(open)
          if (!open) resetSample.reset()
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset the sample account?</DialogTitle>
            <DialogDescription>
              Your markers, answers and practice in this sample will be cleared, and you&apos;ll
              start again from the original sample student.
            </DialogDescription>
          </DialogHeader>
          {resetSample.isError && (
            <p role="alert" className="text-body-sm text-destructive flex items-start gap-2">
              <CircleX aria-hidden className="mt-0.5 size-4 shrink-0" />
              {errorMessage(resetSample.error)}
            </p>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={resetSample.isPending}>
                Cancel
              </Button>
            </DialogClose>
            <Button
              variant="destructive"
              onClick={handleReset}
              pending={resetSample.isPending}
              pendingLabel="Resetting…"
            >
              <RotateCcw aria-hidden />
              Reset sample
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
