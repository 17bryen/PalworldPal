import { useEffect, useMemo, useState } from 'react'
import {
	Alert,
	Box,
	Checkbox,
	Chip,
	FormControlLabel,
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
import { getPal } from '../data/gamedata'
import { worldTree } from '../data/regions'
import { useStore } from '../state/store'
import { MAX_GENERATIONS, type PalRef, type Plan, type PlanNode, type SolveProgress, type TargetResult } from '../solver/types'
import { GenderIcon, PalAvatar, PassiveList } from './bits'
import { StatusChip } from './ListsPanel'

export function formatMinutes(m: number): string {
	if (m < 60) return `~${Math.max(1, Math.round(m))} min`
	return `~${(m / 60).toFixed(m < 600 ? 1 : 0)} h`
}

const formatEggs = (eggs: number) => `~${eggs < 10 ? eggs.toFixed(1).replace(/\.0$/, '') : Math.round(eggs)} egg${eggs > 1.05 ? 's' : ''}`

function SourceBadge({ node }: { node: PalRef & { breed?: PlanNode['breed'] } }) {
	if (node.breed)
		return <Chip size="small" color="primary" label={`Step ${node.breed.stepId}: ${formatEggs(node.breed.eggs)}`} />
	switch (node.source.kind) {
		case 'owned':
			return <Chip size="small" color="success" variant="outlined" label="Owned" />
		case 'catch':
			return (
				<Tooltip title="Catch one with no passives if you can">
					<Chip size="small" color="secondary" variant="outlined" label={`Catch, ${formatMinutes(node.source.minutes)}`} />
				</Tooltip>
			)
		case 'step':
			return <Chip size="small" variant="outlined" label={`From step ${node.source.stepId}`} />
	}
}

function PalLine({ node, big, hideBadge }: { node: PalRef & { breed?: PlanNode['breed'] }; big?: boolean; hideBadge?: boolean }) {
	const owned = useStore().owned
	// Owned pals show every passive they carry, not just the wanted ones
	const ownedPal = node.source.kind === 'owned' ? owned.find((o) => o.uid === (node.source as { ownedUid: string }).ownedUid) : undefined
	return (
		<Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, py: 0.5 }}>
			<PalAvatar palId={node.palId} size={big ? 36 : 28} />
			<Box sx={{ minWidth: 0 }}>
				<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
					<Typography variant={big ? 'subtitle1' : 'body2'} fontWeight={600} noWrap>
						{getPal(node.palId).name}
					</Typography>
					<GenderIcon gender={node.gender} size={16} />
				</Box>
				{ownedPal ? <PassiveList passives={ownedPal.passives} /> : <PassiveList passives={node.passives} other={node.otherPassives} />}
			</Box>
			{!hideBadge && (
				<Box sx={{ ml: 'auto', pl: 1 }}>
					<SourceBadge node={node} />
				</Box>
			)}
		</Box>
	)
}

function Tree({ node }: { node: PlanNode }) {
	if (!node.breed) return null
	return (
		<Box sx={{ ml: 1.75, pl: 2, borderLeft: 2, borderColor: 'divider' }}>
			{node.breed.parents.map((p, i) => (
				<Box key={i}>
					<PalLine node={p} />
					<Tree node={p} />
				</Box>
			))}
		</Box>
	)
}

function TargetCard({ result, selected }: { result: TargetResult; selected: boolean }) {
	const wanted = useStore().wanted.find((w) => w.uid === result.wantedUid)
	return (
		<Paper
			id={`target-${result.wantedUid}`}
			variant="outlined"
			sx={{ p: 1.5, mb: 1.5, borderColor: selected ? 'primary.main' : undefined, transition: 'border-color 200ms' }}
		>
			<Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
				<PalAvatar palId={result.palId} size={40} />
				<Box sx={{ flex: 1, minWidth: 0 }}>
					<Typography variant="subtitle1" fontWeight={700}>
						{getPal(result.palId).name}
					</Typography>
					<PassiveList passives={wanted?.passives ?? []} />
				</Box>
				{result.status === 'planned' && (
					<Typography variant="body2" color="text.secondary">
						{formatMinutes(result.minutes)}
					</Typography>
				)}
				{result.status === 'planned' && result.tree ? <SourceBadge node={result.tree} /> : <StatusChip result={result} />}
			</Box>
			{result.reason && (
				<Alert severity={result.status === 'unreachable' ? 'error' : 'warning'} sx={{ mt: 1, py: 0 }}>
					{result.reason}
				</Alert>
			)}
			{result.tree?.breed && (
				<Box sx={{ mt: 1 }}>
					<Tree node={result.tree} />
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
				const forPal = wanted.find((w) => w.uid === step.forWanted)
				const isDone = done.has(step.id)
				return (
					<Paper key={step.id} variant="outlined" sx={{ p: 1.25, mb: 1, opacity: isDone ? 0.5 : 1 }}>
						<Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
							<Checkbox size="small" checked={isDone} onChange={() => toggle(step.id)} sx={{ p: 0.25 }} />
							<Typography variant="subtitle2">Step {step.id}</Typography>
							<Typography variant="caption" color="text.secondary">
								{formatEggs(step.eggs)}
								{forPal ? `, for ${getPal(forPal.palId).name}` : ''}
							</Typography>
						</Box>
						<Box sx={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr auto 1fr', alignItems: 'center', gap: 1 }}>
							<PalLine node={step.parents[0]} />
							<AddIcon fontSize="small" color="disabled" />
							<PalLine node={step.parents[1]} />
							<ArrowForwardIcon fontSize="small" color="disabled" />
							<PalLine node={step.child} hideBadge />
						</Box>
					</Paper>
				)
			})}
		</Box>
	)
}

function CatchView({ plan }: { plan: Plan }) {
	const wanted = useStore().wanted
	if (!plan.catches.length) return <Empty text="Nothing to catch." />
	return (
		<Table size="small">
			<TableHead>
				<TableRow>
					<TableCell>Pal</TableCell>
					<TableCell>Gender</TableCell>
					<TableCell>Effort</TableCell>
					<TableCell>Wild level</TableCell>
					<TableCell>For</TableCell>
				</TableRow>
			</TableHead>
			<TableBody>
				{plan.catches.map((c) => {
					const pal = getPal(c.palId)
					const tree = worldTree.get(c.palId)
					return (
						<TableRow key={c.palId}>
							<TableCell>
								<Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
									<PalAvatar palId={c.palId} size={26} />
									<Typography variant="body2" fontWeight={600}>
										{pal.name}
									</Typography>
									{(tree === 'only' || tree === 'mostly') && <Chip size="small" variant="outlined" label="World Tree" />}
								</Box>
							</TableCell>
							<TableCell>
								<Box sx={{ display: 'flex' }}>
									{c.male > 0 && <GenderIcon gender="M" />}
									{c.female > 0 && <GenderIcon gender="F" />}
								</Box>
							</TableCell>
							<TableCell>{formatMinutes(c.minutes)}</TableCell>
							<TableCell>
								{pal.minWildLevel}-{pal.maxWildLevel}
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
						<Switch
							size="small"
							checked={settings.onlyWantedPassives}
							onChange={(e) => updateSettings({ onlyWantedPassives: e.target.checked })}
						/>
					}
					label="Only wanted passives"
				/>
			</Tooltip>
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
				{progress.label} ({progress.done + 1} of {progress.total})
			</Typography>
		</Box>
	)
}

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
	const [tab, setTab] = useState<'targets' | 'steps' | 'catches'>('targets')

	useEffect(() => {
		if (selectedWanted && tab === 'targets') document.getElementById(`target-${selectedWanted}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
	}, [selectedWanted, tab, plan])

	const summary = useMemo(() => {
		if (!plan || !plan.targets.length) return null
		const ready = plan.targets.filter((t) => t.status !== 'unreachable').length
		const parts = [`${ready} of ${plan.targets.length} reachable`, `${plan.steps.length} breeding step${plan.steps.length === 1 ? '' : 's'}`]
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
					<Tab value="steps" label={`Steps${plan?.steps.length ? ` (${plan.steps.length})` : ''}`} />
					<Tab value="catches" label={`Catch list${plan?.catches.length ? ` (${plan.catches.length})` : ''}`} />
				</Tabs>
				{summary && (
					<Typography variant="caption" color="text.secondary" sx={{ ml: 'auto', pr: 1 }} noWrap>
						{summary}
					</Typography>
				)}
			</Box>
			<Box sx={{ flex: 1, overflowY: 'auto', minHeight: 0, p: 2, opacity: progress ? 0.6 : 1, transition: 'opacity 200ms' }}>
				{!store.wanted.length ? (
					<Empty text="Your plan shows up here once your wanted list has pals." />
				) : !plan ? null : tab === 'targets' ? (
					plan.targets.map((t) => <TargetCard key={t.wantedUid} result={t} selected={t.wantedUid === selectedWanted} />)
				) : tab === 'steps' ? (
					<StepsView plan={plan} />
				) : (
					<CatchView plan={plan} />
				)}
			</Box>
		</Paper>
	)
}
