import type { MasteryState } from '@lectheo/contracts'
import { Flag, Play, Star } from 'lucide-react'
import { MasteryBadge } from '@/components/mastery-badge'
import { MarkerCounts } from '@/components/marker-counts'

const CONCEPTS: ReadonlyArray<{
  name: string
  state: MasteryState
  confidentMistake?: boolean
  lost?: number
  important?: number
}> = [
  { name: 'Arrays', state: 'green' },
  { name: 'Linked lists', state: 'amber', important: 1 },
  { name: 'Hash tables', state: 'red', confidentMistake: true, lost: 1 },
  { name: 'Tries', state: 'gray' },
]

/** Static, illustrative preview of one lecture in Lectheo (sign-in page only). */
export function ProductPreview() {
  return (
    <figure className="relative" aria-labelledby="preview-caption">
      <div
        aria-hidden
        className="bg-accent/60 absolute -inset-6 -z-10 rounded-[2rem] blur-2xl dark:opacity-40"
      />
      <div className="bg-card border-border overflow-hidden rounded-2xl border shadow-[0_1px_2px_rgb(0_0_0/0.04),0_12px_32px_-12px_rgb(0_0_0/0.12)]">
        <div className="border-border flex items-center justify-between border-b px-5 py-3.5">
          <div>
            <p className="text-muted-foreground text-[0.6875rem] font-semibold tracking-[0.08em] uppercase">
              CS50x · Lecture 5
            </p>
            <p className="font-serif text-lg font-medium">Data Structures</p>
          </div>
          <MarkerCounts lost={1} important={1} />
        </div>

        <div className="px-5 pt-4 pb-2">
          <div aria-hidden className="relative h-8">
            <div className="bg-muted absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full" />
            <div className="bg-primary/70 absolute top-1/2 left-0 h-1 w-[68%] -translate-y-1/2 rounded-full" />
            <span className="bg-marker-important-bg text-marker-important absolute top-1/2 left-[31%] flex size-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full ring-2 ring-[var(--card)]">
              <Star className="size-3 fill-current" />
            </span>
            <span className="bg-marker-lost-bg text-marker-lost absolute top-1/2 left-[62%] flex size-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full ring-2 ring-[var(--card)]">
              <Flag className="size-3 fill-current" />
            </span>
          </div>
          <div className="text-muted-foreground flex justify-between font-mono text-[0.6875rem] tabular-nums">
            <span>0:00</span>
            <span>45:00</span>
          </div>
        </div>

        <ul className="divide-border divide-y px-5">
          {CONCEPTS.map((concept) => (
            <li key={concept.name} className="flex items-center justify-between gap-3 py-3">
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate font-medium">{concept.name}</span>
                <MarkerCounts lost={concept.lost ?? 0} important={concept.important ?? 0} />
              </span>
              <MasteryBadge
                size="sm"
                state={concept.state}
                confidentMistake={concept.confidentMistake}
              />
            </li>
          ))}
        </ul>

        <div className="bg-sunken border-border mt-1 border-t px-5 py-3.5 text-sm">
          <p className="font-medium">Confident mistake: hash table lookup cost</p>
          <p className="text-muted-foreground mt-1 inline-flex items-baseline gap-1.5">
            <Play aria-hidden className="text-primary size-3 translate-y-px fill-current" />
            <span className="text-primary font-mono text-[0.8125rem] font-medium">41:12</span>
            <span aria-hidden>·</span>
            <span className="italic">“…collisions push lookup toward O(n)”</span>
          </p>
        </div>
      </div>
      <figcaption id="preview-caption" className="text-muted-foreground mt-4 text-center text-xs">
        Your flags, your confident mistakes, linked back to the lecture moment.
      </figcaption>
    </figure>
  )
}
