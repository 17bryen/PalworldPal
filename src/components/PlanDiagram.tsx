import { memo, useMemo } from 'react'
import { Background, Controls, Handle, Position, ReactFlow, type Edge, type Node, type NodeProps } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import dagre from '@dagrejs/dagre'
import { Box, Typography } from '@mui/material'
import { getPal } from '../data/gamedata'
import type { Plan, PlanNode } from '../solver/types'
import { PalAvatar, PassiveList } from './bits'
import { useAlternatives } from './Alternatives'
import { SourceBadge } from './PlanPanel'
import { theme } from '../theme'

const NODE_WIDTH = 230
const NODE_HEIGHT = 74

interface PalNodeData extends Record<string, unknown> {
	node: PlanNode
	dim: boolean
	/** Names of the wanted pals this node is */
	wantedFor: string[]
}

const PalNode = memo(function PalNode({ data }: NodeProps<Node<PalNodeData>>) {
	const { node, dim, wantedFor } = data
	const openAlternatives = useAlternatives()
	const isWanted = wantedFor.length > 0
	return (
		<Box
			onClick={() => node.source.kind === 'bred' && openAlternatives(node)}
			sx={{
				width: NODE_WIDTH,
				minHeight: NODE_HEIGHT,
				p: 1,
				borderRadius: 2,
				bgcolor: 'background.paper',
				border: 1.5,
				borderColor: isWanted ? 'primary.main' : 'divider',
				opacity: dim ? 0.35 : 1,
				cursor: node.source.kind === 'bred' ? 'pointer' : 'default',
				display: 'flex',
				gap: 1,
				alignItems: 'center'
			}}
		>
			<Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
			<PalAvatar palId={node.palId} size={36} />
			<Box sx={{ minWidth: 0, flex: 1 }}>
				<Typography variant="body2" fontWeight={700} noWrap>
					{getPal(node.palId).name}
					{node.gender ? ` (${node.gender === 'M' ? 'male' : 'female'})` : ''}
				</Typography>
				<Box sx={{ my: 0.25 }}>
					<SourceBadge node={node} />
				</Box>
				<PassiveList passives={node.passives} />
			</Box>
			<Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
		</Box>
	)
})

const nodeTypes = { pal: PalNode }

/** The whole plan as one graph: shared pals appear once, with a line to each pal they feed */
export default function PlanDiagram({ plan, active }: { plan: Plan; active: Set<string> }) {
	const { nodes, edges } = useMemo(() => {
		const byKey = new Map<string, PlanNode>()
		const wantedFor = new Map<string, string[]>()
		const edgeSet = new Map<string, Edge>()
		const visit = (n: PlanNode) => {
			if (byKey.has(n.key)) return
			byKey.set(n.key, n)
			for (const p of n.parents ?? []) {
				visit(p)
				const id = `${p.key}->${n.key}`
				if (!edgeSet.has(id)) {
					const dim = !active.has(n.key)
					edgeSet.set(id, {
						id,
						source: p.key,
						target: n.key,
						type: 'smoothstep',
						style: { stroke: dim ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.35)', strokeWidth: 1.5 }
					})
				}
			}
		}
		for (const t of plan.targets) {
			if (!t.tree) continue
			visit(t.tree)
			wantedFor.set(t.tree.key, [...(wantedFor.get(t.tree.key) ?? []), getPal(t.palId).name])
		}

		const g = new dagre.graphlib.Graph()
		g.setGraph({ rankdir: 'LR', nodesep: 18, ranksep: 70, marginx: 20, marginy: 20 })
		g.setDefaultEdgeLabel(() => ({}))
		for (const key of byKey.keys()) g.setNode(key, { width: NODE_WIDTH, height: NODE_HEIGHT })
		for (const e of edgeSet.values()) g.setEdge(e.source, e.target)
		dagre.layout(g)

		const nodes: Node<PalNodeData>[] = [...byKey.entries()].map(([key, node]) => {
			const pos = g.node(key)
			return {
				id: key,
				type: 'pal',
				position: { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 },
				data: { node, dim: !active.has(key), wantedFor: wantedFor.get(key) ?? [] },
				draggable: false,
				connectable: false
			}
		})
		return { nodes, edges: [...edgeSet.values()] }
	}, [plan, active])

	if (!nodes.length) {
		return (
			<Typography variant="body2" color="text.secondary" sx={{ p: 3, textAlign: 'center' }}>
				Nothing to show yet.
			</Typography>
		)
	}

	return (
		<Box sx={{ height: '100%', '& .react-flow__attribution': { display: 'none' } }}>
			<ReactFlow
				nodes={nodes}
				edges={edges}
				nodeTypes={nodeTypes}
				colorMode="dark"
				fitView
				fitViewOptions={{ padding: 0.15 }}
				minZoom={0.15}
				maxZoom={1.5}
				nodesConnectable={false}
				elementsSelectable={false}
				proOptions={{ hideAttribution: true }}
				style={{ background: theme.palette.background.paper }}
			>
				<Background gap={24} color="rgba(255,255,255,0.05)" />
				<Controls showInteractive={false} />
			</ReactFlow>
		</Box>
	)
}
