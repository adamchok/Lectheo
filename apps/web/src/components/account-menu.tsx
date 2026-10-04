'use client'

import type { MeResponse } from '@lectheo/contracts'
import { LogOut, Monitor, Moon, RotateCcw, Sun } from 'lucide-react'
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
import { safeRedirect } from '@/lib/safe-redirect'
import { errorMessage } from './error-state'

export const SAMPLE_ACCOUNT_LABEL = 'Sample account · progress resets when you leave'

function initials(name: string | null): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/).slice(0, 2)
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || '?'
}

export function AccountMenu({ me }: { me: MeResponse }) {
  const router = useRouter()
  const [confirmReset, setConfirmReset] = useState(false)
  const resetSample = useResetSample()
  const signOut = useSignOut()
  const { theme, setTheme } = useTheme()
  const name = me.displayName ?? (me.isSample ? 'Sample student' : 'Your account')

  const handleReset = () => {
    resetSample.mutate(undefined, {
      onSuccess: ({ redirect }) => {
        // Full navigation so every cached view re-renders from the fresh copy.
        window.location.assign(safeRedirect(redirect))
      },
      onError: (error) => {
        setConfirmReset(false)
        toast.error("Couldn't reset the sample", { description: errorMessage(error) })
      },
    })
  }

  const handleSignOut = () => {
    signOut.mutate(undefined, {
      onSuccess: () => {
        router.replace('/')
        router.refresh()
      },
      onError: (error) => toast.error("Couldn't sign out", { description: errorMessage(error) }),
    })
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-9 gap-2 pr-2 pl-1.5" aria-label={`Account: ${name}`}>
            <span
              aria-hidden
              className="bg-accent text-accent-foreground flex size-7 items-center justify-center rounded-full text-xs font-semibold"
            >
              {initials(me.displayName)}
            </span>
            <span className="hidden max-w-40 truncate text-sm font-medium sm:inline">{name}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          <DropdownMenuLabel className="space-y-0.5 font-normal">
            <p className="truncate text-sm font-medium">{name}</p>
            {me.isSample && <p className="text-muted-foreground text-xs">{SAMPLE_ACCOUNT_LABEL}</p>}
          </DropdownMenuLabel>
          {me.isSample && (
            <DropdownMenuItem onSelect={() => setConfirmReset(true)}>
              <RotateCcw aria-hidden />
              Reset sample
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-muted-foreground text-xs font-normal">
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
            {signOut.isPending ? 'Signing out…' : 'Sign out'}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={confirmReset} onOpenChange={(open) => !resetSample.isPending && setConfirmReset(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset the sample account?</DialogTitle>
            <DialogDescription>
              Your markers, answers and practice in this sample will be cleared, and you&apos;ll
              start again from the original sample student.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={resetSample.isPending}>
                Cancel
              </Button>
            </DialogClose>
            <Button onClick={handleReset} disabled={resetSample.isPending}>
              {resetSample.isPending ? 'Resetting…' : 'Reset sample'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
