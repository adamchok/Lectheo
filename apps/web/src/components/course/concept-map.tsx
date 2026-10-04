'use client'

import '@xyflow/react/dist/style.css'
import type { CourseMapResponse, MapEdge, MapNode } from '@lectheo/contracts'
import {
  Background,
  Controls,
  MarkerType,
  ReactFlow,
  type Edge,
  type NodeTypes,
} from '@xyflow/react'
import { useMemo, type KeyboardEvent } from 'react'
import { RELATION_LABELS } from '@/lib/labels'
import {
  ConceptNode,
  conceptAriaLabel,
  NODE_HEIGHT,
  NODE_WIDTH,
  type ConceptFlowNode,
} from './concept-node'

const nodeTypes: NodeTypes = { concept: ConceptNode }

type Point = { x: number; y: number }

/** Fallback grid for nodes without a stored position (shouldn't happen once layout is stored). */
function positionOf(node: MapNode, index: number): Point {
  return (
    node.position ?? {
      x: (index % 4) * (NODE_WIDTH + 40),
      y: Math.floor(index / 4) * (NODE_HEIGHT + 72),
    }
  )
}

function toFlowNodes(nodes: readonly MapNode[], selectedId: string | null): ConceptFlowNode[] {
  return (
    nodes
      .map((concept, i) => ({
        id: concept.id,
        type: 'concept' as const,
        position: positionOf(concept, i),
        data: { concept },
        ariaLabel: conceptAriaLabel(concept),
        selected: concept.id === selectedId,
      }))
      // Tab order follows the layers: left column first, then top to bottom.
      .sort((a, b) => a.position.x - b.position.x || a.position.y - b.position.y)
  )
}

const PREREQ = 'var(--primary)'
const OTHER = 'var(--muted-foreground)'

function edgeStyle(relation: MapEdge['relation']): Pick<Edge, 'style' | 'markerEnd'> {
  if (relation === 'depends_on') {
    return {
      style: { stroke: PREREQ, strokeWidth: 2.25 },
      markerEnd: { type: MarkerType.ArrowClosed, color: PREREQ },
    }
  }
  if (relation === 'contrasts_with') {
    return { style: { stroke: OTHER, strokeWidth: 1.25, strokeDasharray: '2 4' } }
  }
  return {
    style: { stroke: OTHER, strokeWidth: 1.25, strokeDasharray: '6 4' },
    markerEnd: { type: MarkerType.ArrowClosed, color: OTHER },
  }
}

/** Edges read "<from> <relation> <to>", arrow at `to`; prerequisites are solid and bold (F2.5). */
function toFlowEdges(edges: readonly MapEdge[], positions: Map<string, Point>): Edge[] {
  return edges
    .filter((e) => positions.has(e.from) && positions.has(e.to))
    .map((e) => {
      const fromAfter = positions.get(e.from)!.x > positions.get(e.to)!.x
      return {
        id: e.id,
        source: e.from,
        target: e.to,
        sourceHandle: fromAfter ? 'left' : 'right',
        targetHandle: fromAfter ? 'right' : 'left',
        label: RELATION_LABELS[e.relation],
        labelStyle: { fontSize: 11, fill: 'var(--muted-foreground)' },
        labelBgStyle: { fill: 'var(--card)' },
        labelBgPadding: [4, 2] as [number, number],
        ...edgeStyle(e.relation),
      }
    })
}

export interface ConceptMapProps {
  map: CourseMapResponse
  selectedId: string | null
  onOpen: (conceptId: string) => void
}

/** React Flow canvas over the stored ELK layout (F2.8: Tab between nodes, Enter opens one). */
export function ConceptMap({ map, selectedId, onOpen }: ConceptMapProps) {
  const nodes = useMemo(() => toFlowNodes(map.nodes, selectedId), [map.nodes, selectedId])
  const edges = useMemo(
    () => toFlowEdges(map.edges, new Map(nodes.map((n) => [n.id, n.position]))),
    [map.edges, nodes],
  )

  // React Flow treats Enter as "select"; we also open the panel for the focused node.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter') return
    const target = event.target as HTMLElement
    const id = target.closest<HTMLElement>('.react-flow__node')?.dataset.id
    if (id) onOpen(id)
  }

  return (
    <div className="bg-card border-border h-[36rem] overflow-hidden rounded-xl border">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodeClick={(_, node) => onOpen(node.id)}
        onKeyDown={onKeyDown}
        nodesDraggable={false}
        nodesConnectable={false}
        edgesFocusable={false}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.2}
        colorMode="system"
        aria-label="Concept map"
      >
        <Background gap={24} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  )
}
