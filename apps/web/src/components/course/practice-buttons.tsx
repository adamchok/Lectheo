'use client'

import type { ActivityType, MasteryState } from '@lectheo/contracts'
import { MessagesSquare, SearchCheck, Shuffle, Swords, type LucideIcon } from 'lucide-react'
import { useId, useState } from 'react'
import { useStartPractice } from '@/client/practice'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { FEATURES } from '@/lib/features'
import { ACTIVITY_LABELS } from '@/lib/labels'

/** Practice entry points, each hidden until its activity flow ships (Spec §3). */
const PRACTICE: readonly { type: ActivityType; icon: LucideIcon; enabled: boolean }[] = [
  { type: 'spot_flaw', icon: SearchCheck, enabled: FEATURES.practiceSpotFlaw },
  { type: 'teach_back', icon: MessagesSquare, enabled: FEATURES.practiceTeachBack },
  { type: 'transfer', icon: Shuffle, enabled: FEATURES.practiceTransfer },
  { type: 'stump', icon: Swords, enabled: FEATURES.stump },
]

export interface PracticeButtonsProps {
  conceptId: string
  /** Read by screen readers after each label, where several concepts share a page (list view). */
  conceptName?: string
  /** Mastery before the activity, so it can show the before → after change (?from=). */
  mastery: MasteryState
  /** Transfer only while the bank has an unseen item for this concept (F4b; map payload). */
  transfer?: boolean
}

/** All four practice types for one concept (F4); the clicked one shows "Preparing…". */
export function PracticeButtons({
  conceptId,
  conceptName,
  mastery,
  transfer,
}: PracticeButtonsProps) {
  const { startPractice, isPending } = useStartPractice()
  const [clicked, setClicked] = useState<ActivityType | null>(null)
  const preparingId = useId()
  const shown = PRACTICE.filter((p) => p.enabled && (p.type !== 'transfer' || transfer))
  if (shown.length === 0) return null

  return (
    <div className="flex flex-wrap gap-2">
      {shown.map(({ type, icon: Icon }) => {
        const pending = isPending && clicked === type
        return (
          <Button
            key={type}
            variant="outline"
            size="sm"
            pending={pending}
            // The others stay focusable but inert while one starts (one activity at a time); the
            // visible "Preparing…" on the clicked one is their reason.
            aria-disabled={isPending && !pending ? true : undefined}
            aria-describedby={isPending && !pending ? preparingId : undefined}
            onClick={() => {
              if (isPending) return
              setClicked(type)
              startPractice({ conceptId, type, mastery })
            }}
          >
            <Icon aria-hidden />
            {pending ? <span id={preparingId}>Preparing…</span> : ACTIVITY_LABELS[type]}
            {conceptName && <span className="sr-only">: {conceptName}</span>}
            {type === 'stump' && (
              <Badge variant="secondary" className="text-label rounded-sm px-1.5 py-0">
                Beta
              </Badge>
            )}
          </Button>
        )
      })}
    </div>
  )
}
