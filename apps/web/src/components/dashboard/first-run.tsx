'use client'

import { Plus } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { useSignOut } from '@/client/queries'
import { errorMessage } from '@/components/error-state'
import { TRY_SAMPLE_HASH } from '@/components/sign-in/sign-in-actions'
import { Button } from '@/components/ui/button'
import { FEATURES } from '@/lib/features'

const LOOP = [
  {
    title: 'Mark',
    text: "When you watch a recording, tap I'm lost or Important where it matters.",
  },
  {
    title: 'Diagnose',
    text: 'Say how sure you are before each answer, so confident mistakes show up.',
  },
  { title: 'Practice', text: "Spot the flaw and teach it back until it's Mastered." },
] as const

/**
 * Home, first run (F0.8, Design System §4): a Google account with no courses. No summary row
 * and no empty cards, one centred block with one primary action.
 */
export function FirstRun() {
  const router = useRouter()
  const signOut = useSignOut()

  // The sample is its own sign-in: leave this account, then land on the landing page's sample
  // button, focused (SignInActions `focusTarget`).
  const trySample = () =>
    signOut.mutate(undefined, {
      onSuccess: () => {
        router.replace(`/#${TRY_SAMPLE_HASH}`)
        router.refresh()
      },
      onError: (error) =>
        toast.error("Couldn't sign out", { description: errorMessage(error), duration: Infinity }),
    })

  return (
    <section
      aria-labelledby="first-run-title"
      className="max-w-reading mx-auto space-y-6 py-6 text-center sm:py-10"
    >
      <h1 id="first-run-title" className="text-title-lg text-balance">
        Add your first lecture
      </h1>
      {/* role="list": Safari drops list semantics from styled lists. */}
      <ol role="list" className="mx-auto max-w-md space-y-3 text-left">
        {LOOP.map((step, i) => (
          <li key={step.title} className="flex gap-3">
            <span
              aria-hidden
              className="bg-accent text-accent-foreground text-label flex size-6 shrink-0 items-center justify-center rounded-full tabular-nums"
            >
              {i + 1}
            </span>
            <p>
              <span className="font-medium">{step.title}.</span>{' '}
              <span className="text-muted-foreground">{step.text}</span>
            </p>
          </li>
        ))}
      </ol>
      <div className="text-body-sm text-muted-foreground mx-auto max-w-md space-y-2 text-pretty">
        <p>
          Bring a recording plus its <code>.vtt</code> or <code>.srt</code> transcript (Teams
          exports a <code>.vtt</code>), an audio file, or a transcript.
        </p>
        <p>For a 60-minute lecture the map is ready in about 3 minutes and questions in about 8.</p>
      </div>
      <div className="flex flex-col items-center gap-3">
        {FEATURES.addLecture && (
          <Button asChild size="lg">
            <Link href="/lectures/new">
              <Plus aria-hidden />
              Add your first lecture
            </Link>
          </Button>
        )}
        <div className="text-body-sm text-muted-foreground flex flex-wrap items-center justify-center gap-x-1">
          <p>Want to look around first?</p>
          <Button
            variant="link"
            size="sm"
            className="h-auto px-0"
            pending={signOut.isPending}
            pendingLabel="Signing out…"
            onClick={trySample}
          >
            Sign out and try the sample account
          </Button>
        </div>
      </div>
    </section>
  )
}
