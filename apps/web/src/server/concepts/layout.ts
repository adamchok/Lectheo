import type { Relation } from '@lectheo/contracts'
import { createHash } from 'node:crypto'
import ELK from 'elkjs/lib/elk.bundled.js'
import type { ElkExtendedEdge } from 'elkjs/lib/elk-api'

/*
 * Concept-map layout (Architecture §4.3 layoutMap). ELK layered, left → right, prerequisites
 * before the concepts that build on them (RIGHT suits the wide map canvas better than DOWN). Stored on courses.layout keyed by concept id, together
 * with layoutHash so the map service (and the pipeline) only recompute when the graph changes.
 */

export type Layout = Record<string, { x: number; y: number }>

export interface LayoutConcept {
  id: string
}
export interface LayoutEdge {
  id: string
  from: string
  to: string
  relation: Relation
}

/** Node box the canvas renders; ELK spaces nodes using it. */
export const NODE_WIDTH = 224
export const NODE_HEIGHT = 84

/**
 * Which way each relation points in the hierarchy ("from <relation> to"): `up` puts `to` before
 * `from` (prerequisite / general concept first), `down` puts `from` before `to`. `contrasts_with`
 * is a sideways link and doesn't shape the layers.
 */
const DIRECTION: Readonly<Record<Relation, 'up' | 'down' | null>> = {
  depends_on: 'up',
  is_a: 'up',
  part_of: 'up',
  example_of: 'up',
  causes: 'down',
  contrasts_with: null,
}

/** Bump when the layout algorithm or its options change, so stored layouts are recomputed. */
const LAYOUT_VERSION = 'v1-right'

/** Stable hash of the graph's identity: sorted concept ids + sorted edge ids (+ version). */
export function layoutHash(
  concepts: readonly LayoutConcept[],
  edges: readonly LayoutEdge[],
): string {
  const ids = concepts
    .map((c) => c.id)
    .sort()
    .join(',')
  const edgeIds = edges
    .map((e) => e.id)
    .sort()
    .join(',')
  return createHash('sha256').update(`${LAYOUT_VERSION}|${ids}|${edgeIds}`).digest('hex')
}

function toElkEdges(
  concepts: readonly LayoutConcept[],
  edges: readonly LayoutEdge[],
): ElkExtendedEdge[] {
  const known = new Set(concepts.map((c) => c.id))
  return [...edges]
    .sort((a, b) => a.id.localeCompare(b.id))
    .filter((e) => DIRECTION[e.relation] && known.has(e.from) && known.has(e.to) && e.from !== e.to)
    .map((e) => {
      const up = DIRECTION[e.relation] === 'up'
      return {
        id: e.id,
        sources: [up ? e.to : e.from],
        targets: [up ? e.from : e.to],
        // depends_on is the main hierarchy: ELK keeps these edges pointing forward first.
        layoutOptions: {
          'elk.layered.priority.direction': e.relation === 'depends_on' ? '10' : '1',
        },
      }
    })
}

/**
 * Positions (top-left, px) for every concept. Deterministic: inputs are sorted by id and ELK's
 * layered algorithm uses a fixed seed.
 */
export async function computeLayout(
  concepts: readonly LayoutConcept[],
  edges: readonly LayoutEdge[],
): Promise<Layout> {
  if (concepts.length === 0) return {}
  const children = [...concepts]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((c) => ({ id: c.id, width: NODE_WIDTH, height: NODE_HEIGHT }))
  const graph = await new ELK().layout({
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.randomSeed': '1',
      'elk.spacing.nodeNode': '32',
      'elk.layered.spacing.nodeNodeBetweenLayers': '96',
      'elk.spacing.componentComponent': '64',
    },
    children,
    edges: toElkEdges(concepts, edges),
  })
  return Object.fromEntries(
    (graph.children ?? []).map((n) => [n.id, { x: Math.round(n.x ?? 0), y: Math.round(n.y ?? 0) }]),
  )
}
