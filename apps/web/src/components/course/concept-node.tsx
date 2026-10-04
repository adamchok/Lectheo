'use client'

import type { MapNode } from '@lectheo/contracts'
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import { MarkerCounts } from '@/components/marker-counts'
import { MasteryBadge } from '@/components/mastery-badge'
import { MASTERY_META } from '@/components/mastery-meta'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

export type ConceptFlowNode = Node<{ concept: MapNode }, 'concept'>

/** Must match NODE_WIDTH / NODE_HEIGHT in server/concepts/layout.ts (ELK spacing). */
export const NODE_WIDTH = 224
export const NODE_HEIGHT = 84

const hiddenHandle = '!size-1 !min-w-0 !border-0 !bg-transparent'
const SIDES = [
  ['left', Position.Left],
  ['right', Position.Right],
] as const

/** Edges attach left or right depending on which node comes first (see concept-map.tsx). */
function Handles() {
  return SIDES.flatMap(([id, position]) =>
    (['target', 'source'] as const).map((type) => (
      <Handle
        key={`${id}-${type}`}
        id={id}
        type={type}
        position={position}
        isConnectable={false}
        className={hiddenHandle}
      />
    )),
  )
}

/** Accessible name for the node wrapper React Flow focuses (F2.8). */
export function conceptAriaLabel(concept: MapNode): string {
  const parts = [concept.name, MASTERY_META[concept.mastery.state].label]
  if (concept.mastery.confidentMistake) parts.push('confident mistake')
  if (concept.markers.lost) parts.push(`${concept.markers.lost} lost`)
  if (concept.markers.important) parts.push(`${concept.markers.important} important`)
  const reasons = concept.mastery.reasons.map((r) => ` ${r}.`).join('')
  return `${parts.join(', ')}.${reasons} Press Enter for details.`
}

/**
 * Map node: name, mastery (icon + label, F6.1), lost/important counts, confident-mistake ring.
 * Mastery reasons show in a hover tooltip; keyboard users get them in the node's aria-label (the
 * badge gets no `reasons`, so it isn't a second Tab stop inside the node).
 */
export function ConceptNode({ data, selected }: NodeProps<ConceptFlowNode>) {
  const { concept } = data
  const meta = MASTERY_META[concept.mastery.state]
  const card = (
    <div
      style={{ width: NODE_WIDTH, minHeight: NODE_HEIGHT }}
      className={cn(
        'bg-card text-card-foreground border-border relative flex cursor-pointer overflow-hidden rounded-lg border shadow-xs transition-shadow hover:shadow-md',
        concept.mastery.confidentMistake && 'ring-mastery-red-solid ring-2 ring-offset-2',
        selected && 'ring-ring ring-2',
      )}
    >
      <span aria-hidden className={cn('w-1.5 shrink-0', meta.solidClass)} />
      <div className="min-w-0 flex-1 space-y-1.5 px-3 py-2">
        <p className="line-clamp-2 text-sm leading-snug font-medium">{concept.name}</p>
        <div className="flex flex-wrap items-center gap-1.5">
          <MasteryBadge
            size="sm"
            state={concept.mastery.state}
            confidentMistake={concept.mastery.confidentMistake}
          />
          <MarkerCounts lost={concept.markers.lost} important={concept.markers.important} />
        </div>
      </div>
      <Handles />
    </div>
  )
  if (concept.mastery.reasons.length === 0) return card
  return (
    <Tooltip>
      <TooltipTrigger asChild>{card}</TooltipTrigger>
      <TooltipContent className="max-w-xs">
        <ul className="space-y-0.5">
          {concept.mastery.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      </TooltipContent>
    </Tooltip>
  )
}
