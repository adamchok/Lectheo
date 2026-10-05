'use client'

import { RedirectResponse } from '@lectheo/contracts'
import { ArrowRight, LoaderCircle } from 'lucide-react'
import type { Route } from 'next'
import { useRouter } from 'next/navigation'
import Script from 'next/script'
import { useCallback, useEffect, useRef, useState } from 'react'
import { apiFetch, isApiClientError } from '@/client/api'
import { Button } from '@/components/ui/button'
import { safeRedirect } from '@/lib/safe-redirect'
import { TURNSTILE_SCRIPT_SRC } from './turnstile'

type SampleState = 'idle' | 'verifying' | 'starting'

/** How long a click waits for the Turnstile script before giving up (blocked or very slow). */
const SCRIPT_TIMEOUT_MS = 10_000
const CHECK_FAILED =
  "The security check didn't load. Check your connection or ad blocker, then refresh and try again."

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

/** "Explore with a sample account" (Turnstile → POST /session/sample) and Google sign-in (F0.1). */
export function SignInActions() {
  const router = useRouter()
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
  const containerRef = useRef<HTMLDivElement>(null)
  const widgetIdRef = useRef<string | undefined>(undefined)
  const pendingRef = useRef(false)
  const [scriptReady, setScriptReady] = useState(false)
  const [sampleState, setSampleState] = useState<SampleState>('idle')
  const [googlePending, setGooglePending] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
        setError(sampleErrorCopy(err))
        setSampleState('idle')
        window.turnstile?.reset(widgetIdRef.current)
      }
    },
    [router],
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
        setError(CHECK_FAILED)
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
  }, [scriptReady, siteKey, startSession])

  // The widget's error-callback only fires once the script has loaded. A blocked or hung script
  // would leave "Checking your browser…" spinning, so a waiting click fails on its own.
  const scriptTimer = useRef<number | undefined>(undefined)
  const [scriptFailed, setScriptFailed] = useState(false)
  const failPendingCheck = useCallback(() => {
    window.clearTimeout(scriptTimer.current)
    if (!pendingRef.current) return
    pendingRef.current = false
    setError(CHECK_FAILED)
    setSampleState('idle')
  }, [])
  useEffect(() => () => window.clearTimeout(scriptTimer.current), [])

  const handleSample = () => {
    setError(null)
    if (!siteKey) {
      setError('Sample accounts are unavailable right now. Please try again later.')
      return
    }
    if (scriptFailed) {
      setError(CHECK_FAILED)
      return
    }
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

  const handleGoogle = async () => {
    setError(null)
    setGooglePending(true)
    try {
      // Loaded on click: the Supabase client (~62 kB) isn't needed to render the landing page.
      const { signInWithGoogle } = await import('@/client/supabase')
      await signInWithGoogle()
    } catch {
      setError("Google sign-in isn't available right now. Try the sample account instead.")
      setGooglePending(false)
    }
  }

  const busy = sampleState !== 'idle' || googlePending

  return (
    <div className="space-y-4">
      {siteKey && (
        <Script
          src={TURNSTILE_SCRIPT_SRC}
          strategy="afterInteractive"
          onReady={() => setScriptReady(true)}
          onError={() => {
            setScriptFailed(true)
            failPendingCheck()
          }}
        />
      )}
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button
          size="lg"
          className="h-11 px-5 text-[0.9375rem]"
          onClick={handleSample}
          disabled={busy}
        >
          {sampleState === 'idle' ? (
            <>
              Explore with a sample account
              <ArrowRight aria-hidden />
            </>
          ) : (
            <>
              <LoaderCircle aria-hidden className="motion-safe:animate-spin" />
              {sampleState === 'verifying' ? 'Checking your browser…' : 'Preparing your sample…'}
            </>
          )}
        </Button>
        <Button
          size="lg"
          variant="outline"
          className="h-11 px-5 text-[0.9375rem]"
          onClick={handleGoogle}
          disabled={busy}
        >
          {googlePending ? (
            <LoaderCircle aria-hidden className="motion-safe:animate-spin" />
          ) : (
            <GoogleIcon />
          )}
          Continue with Google
        </Button>
      </div>
      <div ref={containerRef} className="empty:hidden" />
      <p aria-live="polite" role="status" className="min-h-5 text-sm">
        {error ? <span className="text-destructive">{error}</span> : null}
      </p>
    </div>
  )
}
