import type { CourseMapResponse, MapEdge, MapNode } from '@lectheo/contracts'
import { Network } from 'lucide-react'
import { EmptyState } from '@/components/empty-state'
import { MarkerCounts } from '@/components/marker-counts'
import { MasteryBadge } from '@/components/mastery-badge'
import { RELATION_LABELS } from '@/lib/labels'
import { PracticeButtons } from './practice-buttons'

export function conceptAnchor(conceptId: string): string {
  return `concept-${conceptId}`
}

function ConceptLinks({ node, edges, byId }: { node: MapNode; edges: readonly MapEdge[]; byId: Map<string, MapNode> }) {
  const outgoing = edges.filter((edge) => edge.from === node.id && byId.has(edge.to))
  if (outgoing.length === 0) return null
  return (
    <ul className="text-body-sm text-muted-foreground flex flex-wrap gap-x-3 gap-y-1">
      {outgoing.map((edge) => {
        const target = byId.get(edge.to)!
        return (
          <li key={edge.id}>
            <span>{RELATION_LABELS[edge.relation]} </span>
            <a
              href={`#${conceptAnchor(target.id)}`}
              className="text-foreground decoration-border hover:decoration-foreground underline underline-offset-2"
            >
              {target.name}
            </a>
          </li>
        )
      })}
    </ul>
  )
}

function ConceptRow({ node, edges, byId }: { node: MapNode; edges: readonly MapEdge[]; byId: Map<string, MapNode> }) {
  return (
    <li id={conceptAnchor(node.id)} className="scroll-mt-[calc(var(--topbar-height)+1rem)] space-y-3 py-4">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-heading">{node.name}</h3>
            <MarkerCounts lost={node.markers.lost} important={node.markers.important} />
          </div>
          {node.summary && (
            <p className="text-body-sm text-muted-foreground max-w-2xl text-pretty">{node.summary}</p>
          )}
          <ConceptLinks node={node} edges={edges} byId={byId} />
        </div>
        <MasteryBadge
          state={node.mastery.state}
          reasons={node.mastery.reasons}
          confidentMistake={node.mastery.confidentMistake}
        />
      </div>
      <PracticeButtons
        conceptId={node.id}
        conceptName={node.name}
        mastery={node.mastery.state}
        transfer={node.transferAvailable}
      />
    </li>
  )
}

/**
 * Accessible list alternative to the concept map (F2.8): concepts grouped by lecture with
 * mastery (icon + label), markers and labelled links.
 */
export function ConceptList({ map }: { map: CourseMapResponse }) {
  if (map.nodes.length === 0) {
    return (
      <EmptyState
        icon={Network}
        title="No concepts yet"
        description="Concepts appear here once a lecture has been processed. Lectures with very little conceptual content may have none."
      />
    )
  }

  const byId = new Map(map.nodes.map((node) => [node.id, node]))
  const lectures = [...map.lectures].sort((a, b) => a.seq - b.seq)
  const placed = new Set<string>()
  const groups = lectures
    .map((lecture) => {
      // A concept spanning lectures is listed under the first lecture that introduces it.
      const nodes = map.nodes.filter((node) => node.lectureIds.includes(lecture.id) && !placed.has(node.id))
      nodes.forEach((node) => placed.add(node.id))
      return { lecture, nodes }
    })
    .filter((group) => group.nodes.length > 0)
  const orphans = map.nodes.filter((node) => !placed.has(node.id))

  return (
    <div className="space-y-8">
      {groups.map(({ lecture, nodes }) => (
        <section key={lecture.id} aria-labelledby={`lecture-${lecture.id}`}>
          <h2 id={`lecture-${lecture.id}`} className="border-border flex items-baseline gap-3 border-b pb-2">
            <span className="text-mono-sm text-muted-foreground">Lec {lecture.seq}</span>
            <span className="text-title-md">{lecture.title}</span>
          </h2>
          <ul className="divide-border divide-y">
            {nodes.map((node) => (
              <ConceptRow key={node.id} node={node} edges={map.edges} byId={byId} />
            ))}
          </ul>
        </section>
      ))}
      {orphans.length > 0 && (
        <section aria-labelledby="other-concepts">
          <h2 id="other-concepts" className="text-title-md border-border border-b pb-2">
            Other concepts
          </h2>
          <ul className="divide-border divide-y">
            {orphans.map((node) => (
              <ConceptRow key={node.id} node={node} edges={map.edges} byId={byId} />
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
