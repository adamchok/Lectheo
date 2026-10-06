'use client'

import { RedirectResponse } from '@lectheo/contracts'
import { ArrowRight } from 'lucide-react'
import type { Route } from 'next'
import { useRouter, useSearchParams } from 'next/navigation'
import Script from 'next/script'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { apiFetch, isApiClientError } from '@/client/api'
import { Button } from '@/components/ui/button'
import { safeRedirect } from '@/lib/safe-redirect'
import { cn } from '@/lib/utils'
import { signInLock, useSignInBusy, useSignInTouched } from './sign-in-lock'
import { TURNSTILE_SCRIPT_SRC } from './turnstile'
import { Spinner } from '@/components/ui/spinner'

type SampleState = 'idle' | 'verifying' | 'starting'
type ReportError = (error: string | null) => void

/** How long a click waits for the Turnstile script before giving up (blocked or very slow). */
const SCRIPT_TIMEOUT_MS = 10_000
const CHECK_FAILED =
  "The security check didn't load. Check your connection or ad blocker, then refresh and try again."
const AUTH_FAILED = "Google sign-in didn't complete. Try again."

function sampleErrorCopy(error: unknown): string {
  if (isApiClientError(error)) {
    if (error.status === 429)
      return 'Lots of people are exploring right now. Please wait a minute and try again.'
    if (error.status === 400) return "We couldn't confirm you're not a bot. Please try again."
    if (error.code === 'network_error') return error.message
  }
  return "We couldn't start a sample account just now. Please try again."
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-4">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.34-2.1V7.06H2.18A11 11 0 0 0 1 12c0 1.78.43 3.45 1.18 4.94l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"
      />
    </svg>
  )
}

/** Turnstile → POST /session/sample → dashboard (F0.2). */
function useSampleSignIn(report: ReportError, claim: () => boolean) {
  const router = useRouter()
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
  const containerRef = useRef<HTMLDivElement>(null)
  const widgetIdRef = useRef<string | undefined>(undefined)
  const pendingRef = useRef(false)
  const [scriptReady, setScriptReady] = useState(false)
  const [sampleState, setSampleState] = useState<SampleState>('idle')

  const startSession = useCallback(
    async (turnstileToken: string) => {
      setSampleState('starting')
      try {
        const { redirect } = await apiFetch('/session/sample', {
          method: 'POST',
          body: { turnstileToken },
          schema: RedirectResponse,
        })
        router.push(safeRedirect(redirect) as Route)
      } catch (err) {
        report(sampleErrorCopy(err))
        setSampleState('idle')
        window.turnstile?.reset(widgetIdRef.current)
      }
    },
    [router, report],
  )

  // Render the widget once the script is ready. Execution waits for the click, so no
  // account is created on page load (API Spec §3).
  useEffect(() => {
    const turnstile = window.turnstile
    const container = containerRef.current
    if (!scriptReady || !siteKey || !turnstile || !container || widgetIdRef.current) return
    widgetIdRef.current = turnstile.render(container, {
      sitekey: siteKey,
      action: 'sample_account',
      execution: 'execute',
      appearance: 'interaction-only',
      theme: 'auto',
      callback: (token) => void startSession(token),
      'error-callback': () => {
        report(CHECK_FAILED)
        setSampleState('idle')
      },
      'expired-callback': () => turnstile.reset(widgetIdRef.current),
    })
    if (pendingRef.current) {
      pendingRef.current = false
      turnstile.execute(container)
    }
    return () => {
      turnstile.remove(widgetIdRef.current)
      widgetIdRef.current = undefined
    }
  }, [scriptReady, siteKey, startSession, report])

  // The widget's error-callback only fires once the script has loaded. A blocked or hung script
  // would leave "Checking your browser…" spinning, so a waiting click fails on its own.
  const scriptTimer = useRef<number | undefined>(undefined)
  const [scriptFailed, setScriptFailed] = useState(false)
  const failPendingCheck = useCallback(() => {
    window.clearTimeout(scriptTimer.current)
    if (!pendingRef.current) return
    pendingRef.current = false
    report(CHECK_FAILED)
    setSampleState('idle')
  }, [report])
  useEffect(() => () => window.clearTimeout(scriptTimer.current), [])

  const start = () => {
    report(null)
    if (!siteKey) {
      report('Sample accounts are unavailable right now. Please try again later.')
      return
    }
    if (scriptFailed) {
      report(CHECK_FAILED)
      return
    }
    if (!claim()) return
    setSampleState('verifying')
    const container = containerRef.current
    if (window.turnstile && container && widgetIdRef.current) {
      window.turnstile.execute(container)
    } else {
      pendingRef.current = true
      window.clearTimeout(scriptTimer.current)
      scriptTimer.current = window.setTimeout(failPendingCheck, SCRIPT_TIMEOUT_MS)
    }
  }

  // The landing page mounts several instances on one script tag; next/script tells the later
  // ones through onLoad, not onReady.
  const script = siteKey ? (
    <Script
      src={TURNSTILE_SCRIPT_SRC}
      strategy="afterInteractive"
      onReady={() => setScriptReady(true)}
      onLoad={() => setScriptReady(true)}
      onError={() => {
        setScriptFailed(true)
        failPendingCheck()
      }}
    />
  ) : null

  return { start, sampleState, containerRef, script }
}

function useGoogleSignIn(report: ReportError, claim: () => boolean) {
  const [pending, setPending] = useState(false)
  const start = async () => {
    report(null)
    if (!claim()) return
    setPending(true)
    try {
      // Loaded on click: the Supabase client (~62 kB) isn't needed to render the landing page.
      const { signInWithGoogle } = await import('@/client/supabase')
      await signInWithGoogle()
    } catch {
      report("Google sign-in isn't available right now. Try the sample account instead.")
      setPending(false)
    }
  }
  return { start, pending }
}

export interface SignInActionsProps {
  /**
   * `hero`: both large buttons, errors below. `header`: "Sign in" (from md) and the sample
   * button, errors in a popover. `menu`: "Sign in" only, for the mobile menu.
   */
  variant?: 'hero' | 'header' | 'menu'
  /** When the URL hash is `#<focusTarget>`, focus this instance's sample button on load. */
  focusTarget?: string
}

/** The hash the app links to after signing out to try the sample account (F0.8 first run). */
export const TRY_SAMPLE_HASH = 'try-sample'

/**
 * "Google sign-in didn't complete" after `/?error=auth` from /auth/callback. Reads the query on
 * the client (inside a Suspense boundary) so `/` stays static, then drops `error` from the URL so
 * a reload or a shared link doesn't repeat it. Hidden once any sign-in starts.
 */
export function AuthErrorAlert() {
  const searchParams = useSearchParams()
  // Latched: the URL clean-up below changes searchParams.
  const [failed] = useState(() => searchParams.get('error') === 'auth')
  const touched = useSignInTouched()
  useEffect(() => {
    if (!failed) return
    const url = new URL(window.location.href)
    url.searchParams.delete('error')
    // null state: Next copies its own and syncs its URL, so `?error=auth` can't come back.
    window.history.replaceState(null, '', url)
  }, [failed])
  if (!failed || touched) return null
  return (
    <p role="alert" className="text-destructive text-body-sm">
      {AUTH_FAILED}
    </p>
  )
}

/** Sample account (Turnstile → POST /session/sample) and Google sign-in (F0.1). */
export function SignInActions({ variant = 'hero', focusTarget }: SignInActionsProps) {
  const id = useId()
  const sampleButton = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!focusTarget || window.location.hash !== `#${focusTarget}`) return
    sampleButton.current?.scrollIntoView({ block: 'center' })
    sampleButton.current?.focus()
  }, [focusTarget])
  const [error, setError] = useState<string | null>(null)
  const report = useCallback<ReportError>((next) => setError(next), [])
  const claim = useCallback(() => signInLock.claim(id), [id])
  const { start: startSample, sampleState, containerRef, script } = useSampleSignIn(report, claim)
  const google = useGoogleSignIn(report, claim)

  // Every instance disables while any one signs in; the lock frees when this one goes idle.
  const signingIn = sampleState !== 'idle' || google.pending
  useEffect(() => {
    if (!signingIn) signInLock.release(id)
  }, [signingIn, id])
  // Sign-out lands back on `/` without a reload; a lock left by the old page mustn't stick.
  useEffect(() => () => signInLock.release(id), [id])
  const busy = useSignInBusy()
  const errorText = error ? <span className="text-destructive">{error}</span> : null

  if (variant === 'menu') {
    return (
      <div className="space-y-2">
        <Button
          variant="ghost"
          className="w-full justify-start"
          onClick={google.start}
          disabled={busy}
        >
          {google.pending ? <Spinner /> : <GoogleIcon />}
          Sign in
        </Button>
        <p aria-live="polite" role="status" className="text-caption">
          {errorText}
        </p>
      </div>
    )
  }

  const sampleLabel =
    sampleState === 'idle' ? (
      <>
        Try the sample account
        {variant === 'hero' && <ArrowRight aria-hidden />}
      </>
    ) : (
      <>
        <Spinner />
        {sampleState === 'verifying' ? 'Checking your browser…' : 'Preparing your sample…'}
      </>
    )

  if (variant === 'header') {
    return (
      <div className="relative flex items-center gap-2">
        {script}
        <Button
          variant="ghost"
          className="hidden md:inline-flex"
          onClick={google.start}
          disabled={busy}
        >
          {google.pending && <Spinner />}
          Sign in
        </Button>
        <Button className="px-3 sm:px-4" onClick={startSample} disabled={busy}>
          {sampleLabel}
        </Button>
        {/* Below the 56px bar: an interactive challenge (~300×65) and errors float here. */}
        <div className="absolute top-full right-0 z-overlay mt-2 flex flex-col items-end gap-2">
          <div ref={containerRef} className="empty:hidden" />
          <p
            aria-live="polite"
            role="status"
            className={cn(
              'text-caption bg-popover shadow-popover w-72 rounded-md p-3',
              !error && 'sr-only',
            )}
          >
            {errorText}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {script}
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button
          ref={sampleButton}
          size="lg"
          className="h-11 px-5"
          onClick={startSample}
          disabled={busy}
        >
          {sampleLabel}
        </Button>
        <Button
          size="lg"
          variant="outline"
          className="h-11 px-5"
          onClick={google.start}
          disabled={busy}
        >
          {google.pending ? <Spinner /> : <GoogleIcon />}
          Continue with Google
        </Button>
      </div>
      <div ref={containerRef} className="empty:hidden" />
      <p aria-live="polite" role="status" className="text-body-sm">
        {errorText}
      </p>
    </div>
  )
}
