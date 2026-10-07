'use client'

import type { BriefDepth } from '@lectheo/contracts'
import { ChevronDown } from 'lucide-react'
import type { Route } from 'next'
import Link from 'next/link'
import { useId, useState, type ReactNode } from 'react'
import { SourceRef } from '@/components/source-ref'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/*
 * "Explain in depth" (Product Spec F9.13, Design System §4 "Lecture: Study"): a ghost disclosure
 * under a concept's buttons; open, a sunken panel with How it works, Worked example, Common
 * mistakes and Connects to. AI-written, so labelled. Any number may be open at once.
 */

const RELATION: Readonly<Record<BriefDepth['connects'][number]['relation'], string>> = {
  builds_on: 'Builds on',
  leads_to: 'Leads to',
}

export interface StudyDepthProps {
  depth: BriefDepth
  courseId: string
  /** Concepts on this page, so "Connects to" jumps within it. */
  onPage: ReadonlySet<string>
  /** Plays a cited moment in the block's player; undefined links to the transcript instead. */
  seekable: (lectureId: string) => ((ms: number) => void) | undefined
  /** The concept's name, so each disclosure has its own accessible name. */
  name: string
  /** One below the concept's heading (h3 in the flat list, h4 under a chapter). */
  headingLevel: 3 | 4
}

interface PartProps {
  title: string
  level: 3 | 4
  children: ReactNode
}

function Part({ title, level, children }: PartProps) {
  const Heading = level === 3 ? 'h3' : 'h4'
  return (
    <section className="space-y-2">
      <Heading className="text-heading">{title}</Heading>
      {children}
    </section>
  )
}

export function StudyDepth({
  depth,
  courseId,
  onPage,
  seekable,
  name,
  headingLevel,
}: StudyDepthProps) {
  const [open, setOpen] = useState(false)
  const panelId = useId()
  return (
    <div className="space-y-3">
      <Button
        variant="ghost"
        size="sm"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className="-ml-2"
      >
        <ChevronDown
          aria-hidden
          className={cn('duration-fast transition-transform', open && 'rotate-180')}
        />
        Explain in depth
        <span className="sr-only">: {name}</span>
        <span className="text-muted-foreground font-normal">
          · {Math.max(1, depth.readMinutes)} min read
        </span>
      </Button>
      <div id={panelId} hidden={!open} className="bg-sunken space-y-5 rounded-lg p-4 sm:p-5">
        <Part level={headingLevel} title="How it works">
          {depth.howItWorks.map((p, i) => (
            <p key={i} className="text-body text-pretty">
              {p.text}{' '}
              <span className="ml-1 inline-flex flex-wrap gap-x-3">
                {p.sources.map((s) => (
                  <SourceRef key={s.idx} compact source={s} onSeek={seekable(s.lectureId)} />
                ))}
              </span>
            </p>
          ))}
        </Part>
        {depth.example && (
          <Part level={headingLevel} title="Worked example">
            <p className="text-body text-pretty">{depth.example.text}</p>
            {depth.example.code && (
              // Focusable so a scrolling code block is reachable by keyboard (Safari, WCAG 2.1.1).
              <pre
                tabIndex={0}
                role="region"
                aria-label={'Code example: ' + name}
                className="bg-card border-border text-mono-sm overflow-x-auto rounded-md border p-3"
              >
                <code>{depth.example.code}</code>
              </pre>
            )}
            {depth.example.beyondLecture && (
              <p className="text-caption text-muted-foreground">Beyond the lecture</p>
            )}
          </Part>
        )}
        <Part level={headingLevel} title="Common mistakes">
          <ul className="marker:text-muted-foreground text-body list-disc space-y-2 pl-5">
            {depth.mistakes.map((m, i) => (
              <li key={i} className="text-pretty">
                <span className="font-medium">{m.mistake}</span>{' '}
                <span className="text-muted-foreground">{m.why}</span>
              </li>
            ))}
          </ul>
        </Part>
        {depth.connects.length > 0 && (
          <Part level={headingLevel} title="Connects to">
            <ul className="text-body space-y-1">
              {depth.connects.map((c) => (
                <li key={`${c.relation}-${c.id}`}>
                  <span className="text-muted-foreground">{RELATION[c.relation]} </span>
                  <Link
                    href={(onPage.has(c.id) ? `#concept-${c.id}` : `/courses/${courseId}`) as Route}
                    className="text-primary underline underline-offset-2"
                  >
                    {c.name}
                  </Link>
                </li>
              ))}
            </ul>
          </Part>
        )}
        <p className="text-caption text-muted-foreground">AI-written from the lecture</p>
      </div>
    </div>
  )
}
