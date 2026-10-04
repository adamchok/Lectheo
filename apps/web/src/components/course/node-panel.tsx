'use client'

import type { ActivityType, CourseMapResponse, MapNode, MasteryState } from '@lectheo/contracts'
import { Flag, Star, X } from 'lucide-react'
import type { Route } from 'next'
import Link from 'next/link'
import { useEffect, useRef, type ReactNode } from 'react'
import { useStartPractice } from '@/client/practice'
import { MasteryBadge } from '@/components/mastery-badge'
import { SourceRef } from '@/components/source-ref'
import { Button } from '@/components/ui/button'
import { FEATURES } from '@/lib/features'
import { ACTIVITY_LABELS, RELATION_LABELS } from '@/lib/labels'

/** Practice entry points, each hidden until its activity flow ships (Spec §3). */
const PRACTICE: readonly { type: ActivityType; label: string; enabled: boolean }[] = [
  { type: 'spot_flaw', label: ACTIVITY_LABELS.spot_flaw, enabled: FEATURES.practiceSpotFlaw },
  { type: 'teach_back', label: ACTIVITY_LABELS.teach_back, enabled: FEATURES.practiceTeachBack },
  { type: 'transfer', label: ACTIVITY_LABELS.transfer, enabled: FEATURES.practiceTransfer },
  { type: 'stump', label: ACTIVITY_LABELS.stump, enabled: FEATURES.stump },
]

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-1.5">
      <h3 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{title}</h3>
      {children}
    </section>
  )
}

interface PracticeButtonsProps {
  conceptId: string
  mastery: MasteryState
  transfer?: boolean
}

function PracticeButtons({ conceptId, mastery, transfer }: PracticeButtonsProps) {
  const { startPractice, isPending } = useStartPractice()
  // Transfer only while the bank has an unseen item for this concept (F4b; map payload).
  const enabled = PRACTICE.filter((p) => p.enabled && (p.type !== 'transfer' || transfer))
  if (enabled.length === 0) return null
  return (
    <Section title="Practice">
      <div className="flex flex-wrap gap-2">
        {enabled.map((p) => (
          <Button
            key={p.type}
            size="sm"
            disabled={isPending}
            onClick={() => startPractice({ conceptId, type: p.type, mastery })}
          >
            {p.label}
          </Button>
        ))}
      </div>
    </Section>
  )
}

type Moment = MapNode['moments'][number]

function MomentRow({ moment, lectureTitle }: { moment: Moment; lectureTitle?: string }) {
  const lost = moment.kind === 'lost'
  const Icon = lost ? Flag : Star
  return (
    <li className="flex items-center gap-2 text-sm">
      <Icon
        aria-label={lost ? 'Lost' : 'Important'}
        className={`size-3.5 shrink-0 fill-current ${lost ? 'text-marker-lost' : 'text-marker-important'}`}
      />
      {/* ponytail: markers carry no transcript excerpt in the map payload, so the ref is compact. */}
      <SourceRef
        compact
        source={{ lectureId: moment.lectureId, idx: 0, startMs: moment.tMs, excerpt: '' }}
      />
      <span className="text-muted-foreground truncate">{lectureTitle}</span>
    </li>
  )
}

export interface NodePanelProps {
  concept: MapNode
  map: CourseMapResponse
  onClose: () => void
}

/** Details for one concept (F2.4, F2.5, F6.1), opened by click or Enter on a map node. */
export function NodePanel({ concept, map, onClose }: NodePanelProps) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => headingRef.current?.focus(), [concept.id])

  const lectureById = new Map(map.lectures.map((l) => [l.id, l]))
  const nameById = new Map(map.nodes.map((n) => [n.id, n.name]))
  const links = map.edges.flatMap((e) => {
    if (e.from === concept.id && nameById.has(e.to)) {
      return [{ id: e.id, text: `${RELATION_LABELS[e.relation]} ${nameById.get(e.to)}` }]
    }
    if (e.to === concept.id && nameById.has(e.from)) {
      return [{ id: e.id, text: `${nameById.get(e.from)} ${RELATION_LABELS[e.relation]} this` }]
    }
    return []
  })
  const seq = (lectureId: string) => lectureById.get(lectureId)?.seq ?? 0
  const moments = [...concept.moments].sort(
    (a, b) => seq(a.lectureId) - seq(b.lectureId) || a.tMs - b.tMs,
  )

  return (
    <aside
      aria-labelledby="node-panel-heading"
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
      className="bg-card border-border max-h-full w-full space-y-4 overflow-y-auto rounded-xl border p-5 shadow-lg"
    >
      <div className="flex items-start justify-between gap-3">
        <h2
          id="node-panel-heading"
          ref={headingRef}
          tabIndex={-1}
          className="font-serif text-lg font-medium outline-none"
        >
          {concept.name}
        </h2>
        <Button variant="ghost" size="icon" aria-label="Close details" onClick={onClose}>
          <X aria-hidden />
        </Button>
      </div>

      <div className="space-y-1.5">
        <MasteryBadge
          state={concept.mastery.state}
          confidentMistake={concept.mastery.confidentMistake}
        />
        {concept.mastery.reasons.length > 0 && (
          <ul className="text-muted-foreground list-disc pl-5 text-sm">
            {concept.mastery.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        )}
      </div>

      {concept.summary && <p className="text-sm text-pretty">{concept.summary}</p>}

      <PracticeButtons
        conceptId={concept.id}
        mastery={concept.mastery.state}
        transfer={concept.transferAvailable}
      />

      {concept.lectureIds.length > 0 && (
        <Section title="Appears in">
          <ul className="space-y-1 text-sm">
            {concept.lectureIds.map((id) => (
              <li key={id}>
                <Link href={`/lectures/${id}` as Route} className="underline underline-offset-2">
                  {lectureById.get(id)?.title ?? 'Lecture'}
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {links.length > 0 && (
        <Section title="Links">
          <ul className="text-muted-foreground space-y-0.5 text-sm">
            {links.map((link) => (
              <li key={link.id}>{link.text}</li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Your markers">
        {moments.length === 0 ? (
          <p className="text-muted-foreground text-sm">You haven&apos;t marked this concept yet.</p>
        ) : (
          <ul className="space-y-1">
            {moments.map((m) => (
              <MomentRow key={m.id} moment={m} lectureTitle={lectureById.get(m.lectureId)?.title} />
            ))}
          </ul>
        )}
      </Section>
    </aside>
  )
}
