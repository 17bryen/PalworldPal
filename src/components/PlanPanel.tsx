import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import {
	Alert,
	Badge,
	Box,
	Button,
	Checkbox,
	Chip,
	FormControlLabel,
	IconButton,
	LinearProgress,
	MenuItem,
	Paper,
	Switch,
	Tab,
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableRow,
	Tabs,
	TextField,
	Tooltip,
	Typography
} from '@mui/material'
import ArrowForwardIcon from '@mui/icons-material/ArrowForward'
import AddIcon from '@mui/icons-material/Add'
import SwapIcon from '@mui/icons-material/SwapHoriz'
import MapIcon from '@mui/icons-material/MapOutlined'
import PushPinIcon from '@mui/icons-material/PushPinOutlined'
import { getPal } from '../data/gamedata'
import { worldTree } from '../data/regions'
import { useStore } from '../state/store'
import { MAX_GENERATIONS, pinKey, type Plan, type PlanNode, type SolveProgress, type TargetResult } from '../solver/types'
import { GenderIcon, PalAvatar, PassiveList } from './bits'
import { StatusChip } from './ListsPanel'
import { useAlternatives } from './Alternatives'
import { MapAccessDialog } from './MapAccess'

const PlanDiagram = lazy(() => import('./PlanDiagram'))

export function formatMinutes(m: number): string {
	if (m < 60) return `~${Math.max(1, Math.round(m))} min`
	return `~${(m / 60).toFixed(m < 600 ? 1 : 0)} h`
}

export const formatEggs = (eggs: number) => `~${eggs < 10 ? eggs.toFixed(1).replace(/\.0$/, '') : Math.round(eggs)} egg${eggs > 1.05 ? 's' : ''}`

export function yakumoName(uid: string, owned: { uid: string; stars?: number }[]): string {
	const y = owned.find((o) => o.uid === uid)
	return `Yakumo${y?.stars ? ` (${y.stars} star${y.stars > 1 ? 's' : ''})` : ''}`
}

/** What to do for this pal: breed it in a step, catch it, or use one you own */
export function SourceBadge({ node }: { node: PlanNode }) {
	const owned = useStore().owned
	const src = node.source
	switch (src.kind) {
		case 'bred':
			return (
				<Chip
					size="small"
					color={src.stepId ? 'primary' : 'default'}
					label={src.stepId ? `Step ${src.stepId}: ${formatEggs(src.eggs)}` : formatEggs(src.eggs)}
				/>
			)
		case 'owned':
			return <Chip size="small" color="success" variant="outlined" label="Owned" />
		case 'catch':
			if (src.yakumo)
				return (
					<Tooltip title={`Catch with ${yakumoName(src.yakumo.ownedUid, owned)} summoned until one has these passives`}>
						<Chip size="small" color="secondary" variant="outlined" label={`Yakumo catch, ~${Math.round(src.yakumo.catches)} tries`} />
					</Tooltip>
				)
			return <Chip size="small" color="secondary" variant="outlined" label={`Catch, ${formatMinutes(src.minutes)}`} />
	}
}

function GenderNeed({ node }: { node: PlanNode }) {
	if (node.source.kind === 'owned') return <GenderIcon gender={node.gender} size={16} />
	if (!node.gender) return null
	const word = node.gender === 'M' ? 'male' : 'female'
	return (
		<Tooltip title={node.source.kind === 'bred' ? `Keep hatching until you get a ${word}` : `Catch a ${word}`}>
			<span style={{ display: 'flex' }}>
				<GenderIcon gender={node.gender} size={16} />
			</span>
		</Tooltip>
	)
}

/** Opens the other ways to get a bred pal; shows a pin once the player has chosen one */
export function AlternativesButton({ node }: { node: PlanNode }) {
	const openAlternatives = useAlternatives()
	const pinned = useStore().settings.pins[pinKey(node.palId, node.passives)]
	// Owned pals have nothing to swap; catches can switch to breeding
	if (node.source.kind === 'owned' && !pinned) return null
	return (
		<Tooltip title={pinned ? 'Your choice; change or reset it' : 'Other ways to get this pal'}>
			<IconButton size="small" onClick={() => openAlternatives(node)}>
				{pinned ? <PushPinIcon fontSize="small" color="primary" /> : <SwapIcon fontSize="small" />}
			</IconButton>
		</Tooltip>
	)
}

export function PalLine({ node, big, hideBadge, dim }: { node: PlanNode; big?: boolean; hideBadge?: boolean; dim?: boolean }) {
	return (
		<Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, py: 0.5, opacity: dim ? 0.4 : 1 }}>
			<PalAvatar palId={node.palId} size={big ? 36 : 28} />
			<Box sx={{ minWidth: 0 }}>
				<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
					<Typography variant={big ? 'subtitle1' : 'body2'} fontWeight={600} noWrap>
						{getPal(node.palId).name}
					</Typography>
					<GenderNeed node={node} />
				</Box>
				<PassiveList passives={node.passives} />
			</Box>
			{!hideBadge && (
				<Box sx={{ ml: 'auto', pl: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
					{node.matchGenders && (
						<Tooltip title="Both parents are bred: keep hatching one until their genders differ">
							<Chip size="small" variant="outlined" label="Match genders" />
						</Tooltip>
					)}
					<SourceBadge node={node} />
					<AlternativesButton node={node} />
				</Box>
			)}
		</Box>
	)
}

function Tree({ node, active }: { node: PlanNode; active: Set<string> }) {
	if (!node.parents) return null
	return (
		<Box sx={{ ml: 1.75, pl: 2, borderLeft: 2, borderColor: 'divider' }}>
			{node.parents.map((p, i) => (
				<Box key={i}>
					<PalLine node={p} dim={!active.has(p.key)} />
					<Tree node={p} active={active} />
				</Box>
			))}
		</Box>
	)
}

/** Keys of every node in enabled wanted pals' trees */
export function activeKeys(plan: Plan): Set<string> {
	const keys = new Set<string>()
	const walk = (n: PlanNode) => {
		keys.add(n.key)
		n.parents?.forEach(walk)
	}
	for (const t of plan.targets) if (!t.disabled && t.tree) walk(t.tree)
	return keys
}

function TargetCard({ result, selected, active }: { result: TargetResult; selected: boolean; active: Set<string> }) {
	const wanted = useStore().wanted.find((w) => w.uid === result.wantedUid)
	return (
		<Paper
			id={`target-${result.wantedUid}`}
			variant="outlined"
			sx={{ p: 1.5, mb: 1.5, borderColor: selected ? 'primary.main' : undefined, transition: 'border-color 200ms' }}
		>
			<Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, opacity: result.disabled ? 0.5 : 1 }}>
				<PalAvatar palId={result.palId} size={40} />
				<Box sx={{ flex: 1, minWidth: 0 }}>
					<Typography variant="subtitle1" fontWeight={700}>
						{getPal(result.palId).name}
					</Typography>
					<PassiveList passives={wanted?.passives ?? []} />
				</Box>
				{result.status === 'planned' && !result.disabled && (
					<Typography variant="body2" color="text.secondary">
						{formatMinutes(result.minutes)}
					</Typography>
				)}
				{result.status === 'planned' && result.tree && !result.disabled ? <SourceBadge node={result.tree} /> : <StatusChip result={result} />}
				{result.tree && <AlternativesButton node={result.tree} />}
			</Box>
			{result.reason && (
				<Alert severity={result.status === 'unreachable' ? 'error' : 'warning'} sx={{ mt: 1, py: 0 }}>
					{result.reason}
				</Alert>
			)}
			{result.tree?.parents && (
				<Box sx={{ mt: 1 }}>
					<Tree node={result.tree} active={active} />
				</Box>
			)}
		</Paper>
	)
}

function StepsView({ plan }: { plan: Plan }) {
	const wanted = useStore().wanted
	const [done, setDone] = useState<Set<number>>(new Set())
	useEffect(() => setDone(new Set()), [plan])
	if (!plan.steps.length) return <Empty text="Nothing to breed." />
	const toggle = (id: number) =>
		setDone((d) => {
			const next = new Set(d)
			if (next.has(id)) next.delete(id)
			else next.add(id)
			return next
		})
	return (
		<Box>
			{plan.steps.map((step) => {
				const isDone = done.has(step.id)
				const node = step.node
				const forNames = step.forWanted
					.map((uid) => wanted.find((w) => w.uid === uid))
					.filter(Boolean)
					.map((w) => getPal(w!.palId).name)
				return (
					<Paper key={step.id} variant="outlined" sx={{ p: 1.25, mb: 1, opacity: isDone ? 0.5 : 1 }}>
						<Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
							<Checkbox size="small" checked={isDone} onChange={() => toggle(step.id)} sx={{ p: 0.25 }} />
							<Typography variant="subtitle2">Step {step.id}</Typography>
							<Typography variant="caption" color="text.secondary">
								{node.source.kind === 'bred' && formatEggs(node.source.eggs)}
								{forNames.length ? `, for ${forNames.join(', ')}` : ''}
							</Typography>
							{node.matchGenders && (
								<Tooltip title="Both parents are bred: keep hatching one until their genders differ">
									<Chip size="small" variant="outlined" label="Match genders" sx={{ ml: 'auto' }} />
								</Tooltip>
							)}
						</Box>
						<Box sx={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr auto 1fr', alignItems: 'center', gap: 1 }}>
							<PalLine node={{ ...node.parents![0], parents: undefined }} />
							<AddIcon fontSize="small" color="disabled" />
							<PalLine node={{ ...node.parents![1], parents: undefined }} />
							<ArrowForwardIcon fontSize="small" color="disabled" />
							<PalLine node={node} hideBadge />
						</Box>
					</Paper>
				)
			})}
		</Box>
	)
}

function CatchView({ plan }: { plan: Plan }) {
	const { wanted, owned } = useStore()
	if (!plan.catches.length) return <Empty text="Nothing to catch." />
	return (
		<Table size="small">
			<TableHead>
				<TableRow>
					<TableCell>Pal</TableCell>
					<TableCell>How</TableCell>
					<TableCell>Effort</TableCell>
					<TableCell>Wild level</TableCell>
					<TableCell>For</TableCell>
				</TableRow>
			</TableHead>
			<TableBody>
				{plan.catches.map((c) => {
					const pal = getPal(c.palId)
					return (
						<TableRow key={c.key}>
							<TableCell>
								<Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
									<PalAvatar palId={c.palId} size={26} />
									<Box>
										<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
											<Typography variant="body2" fontWeight={600}>
												{pal.name}
											</Typography>
											<GenderIcon gender={c.gender} size={16} />
										</Box>
										<PassiveList passives={c.passives} />
									</Box>
									{worldTree.get(c.palId) === 'only' && <Chip size="small" variant="outlined" label="World Tree" />}
								</Box>
							</TableCell>
							<TableCell>
								<Typography variant="body2" color="text.secondary">
									{c.yakumo ? `${yakumoName(c.yakumo.ownedUid, owned)} out, ~${Math.round(c.yakumo.catches)} tries` : 'Any'}
								</Typography>
							</TableCell>
							<TableCell>{formatMinutes(c.minutes)}</TableCell>
							<TableCell>
								{pal.minWildLevel != null ? `${pal.minWildLevel}-${pal.maxWildLevel}` : '-'}
							</TableCell>
							<TableCell>
								<Typography variant="body2" color="text.secondary">
									{c.forWanted
										.map((uid) => wanted.find((w) => w.uid === uid))
										.filter(Boolean)
										.map((w) => getPal(w!.palId).name)
										.join(', ')}
								</Typography>
							</TableCell>
						</TableRow>
					)
				})}
			</TableBody>
		</Table>
	)
}

function Empty({ text }: { text: string }) {
	return (
		<Typography variant="body2" color="text.secondary" sx={{ p: 3, textAlign: 'center' }}>
			{text}
		</Typography>
	)
}

function SettingsBar() {
	const { settings, updateSettings } = useStore()
	const [mapOpen, setMapOpen] = useState(false)
	const pinCount = Object.keys(settings.pins).length
	const offRegions = settings.disabledRegions.length
	return (
		<Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2, px: 2, py: 1.25, borderBottom: 1, borderColor: 'divider' }}>
			<Tooltip title="Most breeding steps between a pal you have and a pal you want" placement="top">
				<TextField
					select
					size="small"
					label="Max generations"
					value={settings.maxGenerations}
					onChange={(e) => updateSettings({ maxGenerations: Number(e.target.value) })}
					sx={{ width: 140 }}
				>
					{Array.from({ length: MAX_GENERATIONS }, (_, i) => i + 1).map((n) => (
						<MenuItem key={n} value={n}>
							{n}
						</MenuItem>
					))}
				</TextField>
			</Tooltip>
			<Tooltip title="Rough time to breed and hatch one egg; used to weigh eggs against catches" placement="top">
				<TextField
					size="small"
					type="number"
					label="Minutes per egg"
					value={settings.minutesPerEgg}
					onChange={(e) => updateSettings({ minutesPerEgg: Math.max(1, Number(e.target.value) || 1) })}
					sx={{ width: 130 }}
				/>
			</Tooltip>
			<FormControlLabel
				control={<Switch size="small" checked={settings.allowCatching} onChange={(e) => updateSettings({ allowCatching: e.target.checked })} />}
				label="Suggest catches"
			/>
			<Tooltip title="Legendary pals on your wanted list can still be caught directly" placement="top">
				<FormControlLabel
					control={
						<Switch
							size="small"
							checked={settings.allowLegendaryCatches}
							disabled={!settings.allowCatching}
							onChange={(e) => updateSettings({ allowLegendaryCatches: e.target.checked })}
						/>
					}
					label="Legendary catches"
				/>
			</Tooltip>
			<Tooltip title="Bred pals with wanted passives carry no others, when that's possible" placement="top">
				<FormControlLabel
					control={
						<Switch size="small" checked={settings.onlyWantedPassives} onChange={(e) => updateSettings({ onlyWantedPassives: e.target.checked })} />
					}
					label="Only wanted passives"
				/>
			</Tooltip>
			<Box sx={{ display: 'flex', gap: 1, ml: 'auto' }}>
				<Badge color="warning" badgeContent={offRegions} invisible={!offRegions}>
					<Button size="small" variant="outlined" startIcon={<MapIcon />} onClick={() => setMapOpen(true)}>
						Map access
					</Button>
				</Badge>
				{pinCount > 0 && (
					<Tooltip title="Pairs you chose for specific pals. Clear them to let the planner choose again." placement="top">
						<Button size="small" variant="outlined" startIcon={<PushPinIcon />} onClick={() => updateSettings({ pins: {} })}>
							Clear {pinCount} chosen
						</Button>
					</Tooltip>
				)}
			</Box>
			{mapOpen && <MapAccessDialog onClose={() => setMapOpen(false)} />}
		</Box>
	)
}

function ProgressLine({ progress }: { progress: SolveProgress | null }) {
	// Short runs finish before the bar would be readable; only show it once a run takes a moment
	const [visible, setVisible] = useState(false)
	useEffect(() => {
		if (!progress) {
			setVisible(false)
			return
		}
		const t = setTimeout(() => setVisible(true), 400)
		return () => clearTimeout(t)
	}, [progress === null])
	if (!progress || !visible) return <Box sx={{ height: 4 }} />
	const pct = progress.total ? (progress.done / progress.total) * 100 : 0
	return (
		<Box sx={{ px: 2, pt: 1 }}>
			<LinearProgress variant="determinate" value={pct} />
			<Typography variant="caption" color="text.secondary">
				{progress.label} ({Math.min(progress.done + 1, progress.total)} of {progress.total})
			</Typography>
		</Box>
	)
}

type PlanTab = 'targets' | 'diagram' | 'steps' | 'catches'

export function PlanPanel({
	plan,
	progress,
	error,
	selectedWanted
}: {
	plan: Plan | null
	progress: SolveProgress | null
	error: string | null
	selectedWanted: string | null
}) {
	const store = useStore()
	const [tab, setTab] = useState<PlanTab>('targets')
	const active = useMemo(() => (plan ? activeKeys(plan) : new Set<string>()), [plan])

	useEffect(() => {
		if (selectedWanted && tab === 'targets') document.getElementById(`target-${selectedWanted}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
	}, [selectedWanted, tab, plan])

	const summary = useMemo(() => {
		if (!plan || !plan.targets.length) return null
		const live = plan.targets.filter((t) => !t.disabled)
		const ready = live.filter((t) => t.status !== 'unreachable').length
		const parts = [`${ready} of ${live.length} reachable`, `${plan.steps.length} step${plan.steps.length === 1 ? '' : 's'}`]
		if (plan.steps.length) parts.push(formatEggs(plan.totalEggs))
		if (plan.catches.length) parts.push(`${plan.catches.length} to catch`)
		if (plan.totalMinutes > 0) parts.push(`${formatMinutes(plan.totalMinutes)} total`)
		return parts.join('  |  ')
	}, [plan])

	return (
		<Paper variant="outlined" sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%' }}>
			<SettingsBar />
			<ProgressLine progress={progress} />
			{error && (
				<Alert severity="error" sx={{ mx: 2, mt: 1 }}>
					Planning failed: {error}
				</Alert>
			)}
			<Box sx={{ display: 'flex', alignItems: 'center', px: 1, borderBottom: 1, borderColor: 'divider' }}>
				<Tabs value={tab} onChange={(_, v) => setTab(v)}>
					<Tab value="targets" label="By pal" />
					<Tab value="diagram" label="Tree" />
					<Tab value="steps" label={`Steps${plan?.steps.length ? ` (${plan.steps.length})` : ''}`} />
					<Tab value="catches" label={`Catch list${plan?.catches.length ? ` (${plan.catches.length})` : ''}`} />
				</Tabs>
				{summary && (
					<Typography variant="caption" color="text.secondary" sx={{ ml: 'auto', pr: 1 }} noWrap>
						{summary}
					</Typography>
				)}
			</Box>
			<Box
				sx={{
					flex: 1,
					overflowY: tab === 'diagram' ? 'hidden' : 'auto',
					minHeight: 0,
					p: tab === 'diagram' ? 0 : 2,
					opacity: progress ? 0.6 : 1,
					transition: 'opacity 200ms'
				}}
			>
				{!store.wanted.length ? (
					<Empty text="Your plan shows up here once your wanted list has pals." />
				) : !plan ? null : tab === 'targets' ? (
					plan.targets.map((t) => <TargetCard key={t.wantedUid} result={t} selected={t.wantedUid === selectedWanted} active={active} />)
				) : tab === 'diagram' ? (
					<Suspense fallback={null}>
						<PlanDiagram plan={plan} active={active} />
					</Suspense>
				) : tab === 'steps' ? (
					<StepsView plan={plan} />
				) : (
					<CatchView plan={plan} />
				)}
			</Box>
		</Paper>
	)
}
