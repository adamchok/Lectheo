'use client'

import { useState, useSyncExternalStore } from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'

const CONSENT_KEY = 'lectheo:capture-consent'

const noSubscribe = () => () => undefined
function readStored(): boolean {
  try {
    return window.sessionStorage.getItem(CONSENT_KEY) === '1'
  } catch {
    return false // Storage blocked: ask on every visit.
  }
}

export interface Consent {
  given: boolean
  /** Given earlier this browser session, so the checkbox isn't shown again. */
  remembered: boolean
  set: (value: boolean) => void
}

/** F1.11 / F8.1: asked once per browser session, before any upload. */
export function useConsent(): Consent {
  // Server render and first paint: not consented; the stored answer is read on the client.
  const stored = useSyncExternalStore(noSubscribe, readStored, () => false)
  const [answered, setAnswered] = useState<boolean | null>(null)
  const given = answered ?? stored
  const remembered = stored && answered === null
  const set = (value: boolean) => {
    setAnswered(value)
    try {
      if (value) window.sessionStorage.setItem(CONSENT_KEY, '1')
      else window.sessionStorage.removeItem(CONSENT_KEY)
    } catch {
      // Not remembered; the checkbox still works on this page.
    }
  }
  return { given, remembered, set }
}

export function ConsentCheckbox({ consent }: { consent: Consent }) {
  if (consent.remembered) return null
  return (
    <div className="flex items-start gap-3 rounded-lg border p-4">
      <Checkbox
        id="capture-consent"
        checked={consent.given}
        onCheckedChange={(value) => consent.set(value === true)}
        className="mt-0.5"
      />
      <Label htmlFor="capture-consent" className="leading-snug font-normal">
        I have permission to record or use this lecture.
      </Label>
    </div>
  )
}
