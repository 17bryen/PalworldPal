import { memo, useCallback, useMemo, useRef, useState } from 'react'
import { Background, Controls, Handle, MarkerType, Position, ReactFlow, type Edge, type Node, type NodeProps } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import dagre from '@dagrejs/dagre'
import { Box, Typography } from '@mui/material'
import { getPal } from '../data/gamedata'
import type { Plan, PlanNode } from '../solver/types'
import { GenderIcon, PalAvatar } from './bits'
import { useAlternatives } from './Alternatives'
import { formatEggs, NodePassives, SourceBadge } from './PlanPanel'
import { theme } from '../theme'

const PAL_WIDTH = 200
const PAL_HEIGHT = 76
const STEP_WIDTH = 120
const STEP_HEIGHT = 28

interface PalNodeData extends Record<string, unknown> {
	node: PlanNode
	dim: boolean
	faded: boolean
	wanted: boolean
	/** Surgery Table implants, on a wanted pal */
	implants: string[]
}

interface StepNodeData extends Record<string, unknown> {
	node: PlanNode
	dim: boolean
	faded: boolean
}

const hidden = { opacity: 0, pointerEvents: 'none' as const }

const PalNode = memo(function PalNode({ data }: NodeProps<Node<PalNodeData>>) {
	const { node, dim, faded, wanted, implants } = data
	return (
		<Box
			sx={{
				width: PAL_WIDTH,
				minHeight: PAL_HEIGHT,
				p: 1,
				borderRadius: 2,
				bgcolor: 'background.default',
				border: wanted ? 2 : 1,
				borderColor: wanted ? 'primary.main' : 'rgba(255,255,255,0.14)',
				opacity: faded ? 0.15 : dim ? 0.4 : 1,
				transition: 'opacity 120ms',
				display: 'flex',
				gap: 1,
				alignItems: 'center'
			}}
		>
			<Handle type="target" position={Position.Top} style={hidden} />
			<PalAvatar palId={node.palId} size={36} />
			<Box sx={{ minWidth: 0, flex: 1 }}>
				<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
					<Typography variant="body2" fontWeight={700} noWrap>
						{getPal(node.palId).name}
					</Typography>
					<GenderIcon gender={node.gender} size={15} />
				</Box>
				{/* Bred pals get their step and eggs from the step box above them */}
				{node.source.kind !== 'bred' && (
					<Box sx={{ my: 0.25 }}>
						<SourceBadge node={node} />
					</Box>
				)}
				<NodePassives node={node} implants={implants} />
			</Box>
			<Handle type="source" position={Position.Bottom} style={hidden} />
		</Box>
	)
})

/** One breeding step: the two parents above feed into it, the child hangs below it */
const StepNode = memo(function StepNode({ data }: NodeProps<Node<StepNodeData>>) {
	const { node, dim, faded } = data
	const openAlternatives = useAlternatives()
	const src = node.source.kind === 'bred' ? node.source : null
	return (
		<Box
			onClick={() => openAlternatives(node)}
			title="Other ways to get this pal"
			sx={{
				width: STEP_WIDTH,
				height: STEP_HEIGHT,
				borderRadius: 14,
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				bgcolor: src?.stepId ? 'primary.main' : 'action.selected',
				color: src?.stepId ? 'primary.contrastText' : 'text.secondary',
				opacity: faded ? 0.15 : dim ? 0.4 : 1,
				transition: 'opacity 120ms',
				cursor: 'pointer',
				'&:hover': { filter: 'brightness(1.15)' }
			}}
		>
			<Handle type="target" position={Position.Top} style={hidden} />
			<Typography variant="caption" fontWeight={700} noWrap>
				{src?.stepId ? `Step ${src.stepId}: ` : ''}
				{src ? formatEggs(src.eggs) : ''}
			</Typography>
			<Handle type="source" position={Position.Bottom} style={hidden} />
		</Box>
	)
})

const nodeTypes = { pal: PalNode, step: StepNode }
const stepId = (key: string) => `step:${key}`

/** The whole plan as one lineage graph, parents above children; shared pals appear once */
export default function PlanDiagram({ plan, active }: { plan: Plan; active: Set<string> }) {
	const [hovered, setHovered] = useState<string | null>(null)

	const graph = useMemo(() => {
		// Graph node id -> the plan node it draws. Bred pals appear once even when several steps
		// use them; owned and caught pals get a copy beside each step that uses them, so no line
		// has to cross the whole tree to reach them.
		const pals = new Map<string, PlanNode>()
		const steps = new Map<string, PlanNode>()
		const wanted = new Map<string, string[]>()
		const up = new Map<string, string[]>()
		const down = new Map<string, string[]>()
		const edges: { source: string; target: string; child: string }[] = []
		const link = (from: string, to: string, child: string) => {
			edges.push({ source: from, target: to, child })
			down.set(from, [...(down.get(from) ?? []), to])
			up.set(to, [...(up.get(to) ?? []), from])
		}
		const visit = (n: PlanNode) => {
			if (pals.has(n.key)) return
			pals.set(n.key, n)
			if (!n.parents) return
			const step = stepId(n.key)
			steps.set(step, n)
			// The same parent twice (a pal bred with its own kind) still draws one line
			const parents = [...new Map(n.parents.map((p) => [p.key, p])).values()]
			for (const p of parents) {
				if (p.parents) {
					visit(p)
					link(p.key, step, n.key)
				} else {
					const copy = `${p.key}@${n.key}`
					pals.set(copy, p)
					link(copy, step, n.key)
				}
			}
			link(step, n.key, n.key)
		}
		for (const t of plan.targets) {
			if (!t.tree) continue
			visit(t.tree)
			wanted.set(t.tree.key, [...new Set([...(wanted.get(t.tree.key) ?? []), ...t.implants])])
		}

		const g = new dagre.graphlib.Graph()
		g.setGraph({ rankdir: 'TB', nodesep: 24, ranksep: 36, edgesep: 12, marginx: 24, marginy: 24 })
		g.setDefaultEdgeLabel(() => ({}))
		for (const id of pals.keys()) g.setNode(id, { width: PAL_WIDTH, height: PAL_HEIGHT })
		for (const id of steps.keys()) g.setNode(id, { width: STEP_WIDTH, height: STEP_HEIGHT })
		for (const e of edges) g.setEdge(e.source, e.target)
		dagre.layout(g)

		return { pals, steps, wanted, edges, up, down, g }
	}, [plan])

	// Everything in the hovered pal's line: its ancestors, its descendants, and the partner it
	// pairs with at each step on the way down
	const lineage = useMemo(() => {
		if (!hovered) return null
		const seen = new Set<string>([hovered])
		const walk = (id: string, dir: Map<string, string[]>) => {
			for (const next of dir.get(id) ?? []) {
				if (seen.has(next)) continue
				seen.add(next)
				walk(next, dir)
			}
		}
		walk(hovered, graph.up)
		const descendants = new Set<string>()
		const down = (id: string) => {
			for (const next of graph.down.get(id) ?? []) {
				if (descendants.has(next)) continue
				descendants.add(next)
				if (next.startsWith('step:')) for (const partner of graph.up.get(next) ?? []) seen.add(partner)
				down(next)
			}
		}
		down(hovered)
		for (const id of descendants) seen.add(id)
		return seen
	}, [hovered, graph])

	// Nodes and edges whose look didn't change keep their objects, so hovering redraws only what it lights or fades
	const built = useRef({ graph, nodes: new Map<string, { look: string; node: Node }>(), edges: new Map<string, { look: string; edge: Edge }>() })
	const { nodes, edges } = useMemo(() => {
		if (built.current.graph !== graph) built.current = { graph, nodes: new Map(), edges: new Map() }
		const cache = built.current
		const reuse = (id: string, look: string, make: () => Node) => {
			const prev = cache.nodes.get(id)
			if (prev && prev.look === look) return prev.node
			const node = make()
			cache.nodes.set(id, { look, node })
			return node
		}
		const { pals, steps, wanted, g } = graph
		const faded = (id: string) => !!lineage && !lineage.has(id)
		const nodes: Node[] = []
		for (const [id, node] of pals) {
			const dim = !active.has(node.key)
			const fade = faded(id)
			nodes.push(
				reuse(id, `${dim}|${fade}`, () => {
					const pos = g.node(id)
					return {
						id,
						type: 'pal',
						position: { x: pos.x - PAL_WIDTH / 2, y: pos.y - PAL_HEIGHT / 2 },
						data: { node, dim, faded: fade, wanted: wanted.has(id), implants: wanted.get(id) ?? [] } satisfies PalNodeData,
						draggable: false,
						connectable: false
					}
				})
			)
		}
		for (const [id, node] of steps) {
			const dim = !active.has(node.key)
			const fade = faded(id)
			nodes.push(
				reuse(id, `${dim}|${fade}`, () => {
					const pos = g.node(id)
					return {
						id,
						type: 'step',
						position: { x: pos.x - STEP_WIDTH / 2, y: pos.y - STEP_HEIGHT / 2 },
						data: { node, dim, faded: fade } satisfies StepNodeData,
						draggable: false,
						connectable: false
					}
				})
			)
		}
		const edges: Edge[] = graph.edges.map((e) => {
			const lit = !!lineage && lineage.has(e.source) && lineage.has(e.target)
			const dim = !active.has(e.child)
			const id = `${e.source}->${e.target}`
			const look = `${lit}|${dim}|${!!lineage}`
			const prev = cache.edges.get(id)
			if (prev && prev.look === look) return prev.edge
			const color = lit ? theme.palette.primary.main : dim ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.45)'
			const edge: Edge = {
				id,
				source: e.source,
				target: e.target,
				type: 'default',
				style: { stroke: color, strokeWidth: lit ? 2.5 : 1.5, opacity: lineage && !lit ? 0.25 : 1 },
				markerEnd: e.target === e.child ? { type: MarkerType.ArrowClosed, color, width: 16, height: 16 } : undefined,
				zIndex: lit ? 1 : 0
			}
			cache.edges.set(id, { look, edge })
			return edge
		})
		return { nodes, edges }
	}, [graph, lineage, active])

	const onEnter = useCallback((_: unknown, n: Node) => setHovered(n.id), [])
	const onLeave = useCallback(() => setHovered(null), [])

	if (!nodes.length) {
		return (
			<Typography variant="body2" color="text.secondary" sx={{ p: 3, textAlign: 'center' }}>
				Nothing to show yet.
			</Typography>
		)
	}

	return (
		<Box sx={{ height: '100%', position: 'relative' }}>
			<ReactFlow
				nodes={nodes}
				edges={edges}
				nodeTypes={nodeTypes}
				colorMode="dark"
				fitView
				fitViewOptions={{ padding: 0.1 }}
				minZoom={0.1}
				maxZoom={1.5}
				nodesConnectable={false}
				elementsSelectable={false}
				onNodeMouseEnter={onEnter}
				onNodeMouseLeave={onLeave}
				proOptions={{ hideAttribution: true }}
				style={{ background: theme.palette.background.paper }}
			>
				<Background gap={24} color="rgba(255,255,255,0.05)" />
				<Controls showInteractive={false} />
			</ReactFlow>
			<Typography variant="caption" color="text.secondary" sx={{ position: 'absolute', bottom: 8, right: 12, pointerEvents: 'none' }}>
				Hover a pal to trace its line. Click a step to change it.
			</Typography>
		</Box>
	)
}
