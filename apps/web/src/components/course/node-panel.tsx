'use client'

import type { CourseMapResponse, MapNode } from '@lectheo/contracts'
import { BookOpenText, Flag, Star, X } from 'lucide-react'
import type { Route } from 'next'
import Link from 'next/link'
import { useEffect, useRef, type ReactNode } from 'react'
import { MasteryBadgeTransition } from '@/components/mastery-badge-transition'
import { SourceRef } from '@/components/source-ref'
import { Button } from '@/components/ui/button'
import { RELATION_LABELS } from '@/lib/labels'
import { PracticeButtons } from './practice-buttons'

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-1.5">
      <h3 className="text-overline text-muted-foreground">{title}</h3>
      {children}
    </section>
  )
}

type Moment = MapNode['moments'][number]

function MomentRow({ moment, lectureTitle }: { moment: Moment; lectureTitle?: string }) {
  const lost = moment.kind === 'lost'
  const Icon = lost ? Flag : Star
  return (
    <li className="flex items-center gap-2 text-body-sm">
      <Icon
        role="img"
        aria-label={lost ? "I'm lost" : 'Important'}
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

/** Where the lecture teaches the concept (F2.4): "▶ 12:41 · excerpt", most salient first. */
export function TaughtAt({ sources }: { sources: MapNode['sources'] }) {
  if (sources.length === 0) return null
  return (
    <Section title="Where it's taught">
      <ul className="space-y-0.5">
        {sources.map((s) => (
          <li key={`${s.lectureId}-${s.idx}`}>
            <SourceRef source={s} />
          </li>
        ))}
      </ul>
    </Section>
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
  // Esc closes the sheet wherever focus is, on the map or in the panel (F2.10).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || e.isComposing) return
      // Esc in a text field (a native search input) clears it; it doesn't close the sheet.
      if ((e.target as Element | null)?.closest?.('input, textarea, select, [contenteditable]'))
        return
      onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

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
  // F9: the concept's block in the Study brief of the first lecture that teaches it.
  const studyLecture = concept.lectureIds
    .map((id) => lectureById.get(id))
    .find((l) => l?.status === 'map_ready' || l?.status === 'ready')
  const moments = [...concept.moments].sort(
    (a, b) => seq(a.lectureId) - seq(b.lectureId) || a.tMs - b.tMs,
  )

  return (
    <aside
      aria-labelledby="node-panel-heading"
      className="bg-card border-border w-full space-y-4 rounded-lg border p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <h2 id="node-panel-heading" ref={headingRef} tabIndex={-1} className="text-title-md">
          {concept.name}
        </h2>
        <Button variant="ghost" size="icon" aria-label="Close details" onClick={onClose}>
          <X aria-hidden />
        </Button>
      </div>

      <div className="space-y-1.5">
        <MasteryBadgeTransition
          state={concept.mastery.state}
          confidentMistake={concept.mastery.confidentMistake}
        />
        {concept.mastery.reasons.length > 0 && (
          <ul className="text-muted-foreground list-disc pl-5 text-body-sm">
            {concept.mastery.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        )}
      </div>

      {concept.summary && <p className="text-body-sm text-pretty">{concept.summary}</p>}
      {studyLecture && (
        <Button asChild variant="outline" size="sm">
          <Link href={`/lectures/${studyLecture.id}#concept-${concept.id}` as Route}>
            <BookOpenText aria-hidden />
            Read about it
          </Link>
        </Button>
      )}

      <Section title="Practice">
        <PracticeButtons
          conceptId={concept.id}
          mastery={concept.mastery.state}
          transfer={concept.transferAvailable}
        />
      </Section>

      {concept.lectureIds.length > 0 && (
        <Section title="Appears in">
          <ul className="space-y-1 text-body-sm">
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

      <TaughtAt sources={concept.sources} />

      {links.length > 0 && (
        <Section title="Links">
          <ul className="text-muted-foreground space-y-0.5 text-body-sm">
            {links.map((link) => (
              <li key={link.id}>{link.text}</li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Your markers">
        {moments.length === 0 ? (
          <p className="text-muted-foreground text-body-sm">
            You haven&apos;t marked this concept yet.
          </p>
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
