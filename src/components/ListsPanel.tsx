import { useMemo, useState } from 'react'
import {
	Box,
	Button,
	Checkbox,
	Chip,
	MenuItem,
	IconButton,
	InputAdornment,
	Paper,
	Tab,
	Tabs,
	TextField,
	ToggleButton,
	ToggleButtonGroup,
	Tooltip,
	Typography
} from '@mui/material'
import EditIcon from '@mui/icons-material/EditOutlined'
import DeleteIcon from '@mui/icons-material/DeleteOutline'
import SearchIcon from '@mui/icons-material/Search'
import MaleIcon from '@mui/icons-material/Male'
import FemaleIcon from '@mui/icons-material/Female'
import StarIcon from '@mui/icons-material/Star'
import AddIcon from '@mui/icons-material/Add'
import CheckIcon from '@mui/icons-material/Check'
import { getPal, YAKUMO_ID, type Gender } from '../data/gamedata'
import { useGamePals } from '../state/bridge'
import { planAdd, type GamePal } from '../state/gamepals'
import { useStore } from '../state/store'
import type { Plan, PlanNode, TargetResult } from '../solver/types'
import { GenderIcon, PalAvatar, PassiveList } from './bits'
import { PalPicker, PassivePicker } from './pickers'
import { LazyItem, LazyScroll } from './lazy'

interface Draft {
	uid?: string
	palId: string | null
	gender: Gender
	passives: string[]
	stars: number
}

const emptyDraft: Draft = { palId: null, gender: 'M', passives: [], stars: 0 }

function EntryForm({
	withGender,
	draft,
	setDraft,
	onSubmit
}: {
	withGender: boolean
	draft: Draft
	setDraft: (d: Draft) => void
	onSubmit: () => void
}) {
	const editing = !!draft.uid
	return (
		<Box
			component="form"
			onSubmit={(e) => {
				e.preventDefault()
				if (draft.palId) onSubmit()
			}}
			sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center', p: 1.5, borderBottom: 1, borderColor: 'divider' }}
		>
			<Box sx={{ flex: '1 1 200px' }}>
				<PalPicker value={draft.palId} onChange={(palId) => setDraft({ ...draft, palId })} />
			</Box>
			{withGender && (
				<ToggleButtonGroup
					size="small"
					exclusive
					value={draft.gender}
					onChange={(_, g: Gender | null) => g && setDraft({ ...draft, gender: g })}
				>
					<ToggleButton value="M" aria-label="Male">
						<MaleIcon fontSize="small" sx={{ color: '#6fb3f0' }} />
					</ToggleButton>
					<ToggleButton value="F" aria-label="Female">
						<FemaleIcon fontSize="small" sx={{ color: '#f08ac0' }} />
					</ToggleButton>
				</ToggleButtonGroup>
			)}
			{withGender && draft.palId === YAKUMO_ID && (
				<Tooltip title="Condensation stars; more stars copy passives more often">
					<TextField
						select
						size="small"
						label="Stars"
						value={draft.stars}
						onChange={(e) => setDraft({ ...draft, stars: Number(e.target.value) })}
						sx={{ width: 80 }}
					>
						{[0, 1, 2, 3, 4].map((n) => (
							<MenuItem key={n} value={n}>
								{n}
							</MenuItem>
						))}
					</TextField>
				</Tooltip>
			)}
			<Box sx={{ flex: '2 1 260px', display: 'flex' }}>
				<PassivePicker
					value={draft.passives}
					onChange={(passives) => setDraft({ ...draft, passives })}
					label={withGender ? (draft.palId === YAKUMO_ID ? 'Passives, in Slot Order' : 'Passives') : 'Target Passives'}
				/>
			</Box>
			<Box sx={{ display: 'flex', gap: 1 }}>
				{editing && <Button onClick={() => setDraft(emptyDraft)}>Cancel</Button>}
				<Button type="submit" variant="contained" disabled={!draft.palId}>
					{editing ? 'Save' : 'Add'}
				</Button>
			</Box>
		</Box>
	)
}

function Row({
	palId,
	gender = null,
	passives,
	stars,
	status,
	selected,
	enabled,
	onToggle,
	onClick,
	onEdit,
	onDelete
}: {
	palId: string
	gender?: Gender | null
	passives: string[]
	stars?: number
	status?: React.ReactNode
	selected?: boolean
	/** Wanted pals only: whether it's in the steps and catch list */
	enabled?: boolean
	onToggle?: () => void
	onClick?: () => void
	onEdit: () => void
	onDelete: () => void
}) {
	return (
		<Box
			onClick={onClick}
			sx={{
				display: 'flex',
				alignItems: 'center',
				gap: 1.5,
				px: 1.5,
				py: 1,
				borderBottom: 1,
				borderColor: 'divider',
				cursor: onClick ? 'pointer' : 'default',
				bgcolor: selected ? 'action.selected' : undefined,
				'&:hover': { bgcolor: selected ? 'action.selected' : 'action.hover' },
				'&:hover .row-actions': { opacity: 1 }
			}}
		>
			{onToggle && (
				<Tooltip title={enabled ? 'Pause: leave out of the steps for now' : 'Resume'}>
					<Checkbox
						size="small"
						checked={!!enabled}
						onClick={(e) => e.stopPropagation()}
						onChange={onToggle}
						sx={{ p: 0.25, ml: -0.5 }}
					/>
				</Tooltip>
			)}
			<Box sx={{ display: 'contents', '& > *': { opacity: enabled === false ? 0.45 : 1 } }}>
			<PalAvatar palId={palId} />
			<Box sx={{ flex: 1, minWidth: 0 }}>
				<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: passives.length ? 0.5 : 0 }}>
					<Typography variant="body2" fontWeight={600} noWrap>
						{getPal(palId).name}
					</Typography>
					<GenderIcon gender={gender} size={16} />
					{stars != null && palId === YAKUMO_ID && (
						<Box sx={{ display: 'flex', alignItems: 'center', color: 'warning.main', ml: 0.5 }}>
							<StarIcon sx={{ fontSize: 14 }} />
							<Typography variant="caption" fontWeight={700}>
								{stars}
							</Typography>
						</Box>
					)}
				</Box>
				<PassiveList passives={passives} />
			</Box>
			{status}
			</Box>
			<Box className="row-actions" sx={{ display: 'flex', opacity: 0.35, transition: 'opacity 120ms' }}>
				<Tooltip title="Edit">
					<IconButton
						size="small"
						onClick={(e) => {
							e.stopPropagation()
							onEdit()
						}}
					>
						<EditIcon fontSize="small" />
					</IconButton>
				</Tooltip>
				<Tooltip title="Remove">
					<IconButton
						size="small"
						onClick={(e) => {
							e.stopPropagation()
							onDelete()
						}}
					>
						<DeleteIcon fontSize="small" />
					</IconButton>
				</Tooltip>
			</Box>
		</Box>
	)
}

function GameRow({ pal, added, onAdd }: { pal: GamePal; added: boolean; onAdd: () => void }) {
	return (
		<Box
			sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 1.5, py: 1, borderBottom: 1, borderColor: 'divider', '&:hover': { bgcolor: 'action.hover' } }}
		>
			<PalAvatar palId={pal.palId} />
			<Box sx={{ flex: 1, minWidth: 0 }}>
				<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: pal.passives.length ? 0.5 : 0 }}>
					<Typography variant="body2" fontWeight={600} noWrap>
						{getPal(pal.palId).name}
					</Typography>
					<GenderIcon gender={pal.gender} size={16} />
				</Box>
				<PassiveList passives={pal.passives} />
			</Box>
			{added ? (
				<Tooltip title="In My Pals">
					<CheckIcon fontSize="small" color="success" sx={{ m: 0.625 }} />
				</Tooltip>
			) : (
				<Tooltip title="Add to My Pals">
					<IconButton size="small" onClick={onAdd}>
						<AddIcon fontSize="small" />
					</IconButton>
				</Tooltip>
			)}
		</Box>
	)
}

const rowEstimate = (passives: string[]) => (passives.length ? 65 : 49)

export function countSteps(node: PlanNode | undefined): number {
	if (!node?.parents) return 0
	return 1 + countSteps(node.parents[0]) + countSteps(node.parents[1])
}

export function StatusChip({ result }: { result?: TargetResult }) {
	if (!result) return <Chip size="small" label="..." variant="outlined" />
	if (result.disabled && result.status !== 'unreachable') return <Chip size="small" variant="outlined" label="Paused" />
	if (result.status === 'unreachable')
		return (
			<Tooltip title={result.reason ?? ''}>
				<Chip size="small" color="error" variant="outlined" label="Can't Reach" />
			</Tooltip>
		)
	const missing = result.missingPassives.length
	if (result.status === 'have' && !missing) return <Chip size="small" color="success" variant="outlined" label="Have It" />
	const steps = countSteps(result.tree)
	const label =
		result.status === 'have'
			? 'Owned'
			: steps
				? `${steps} Step${steps > 1 ? 's' : ''}`
				: result.tree?.source.kind === 'catch'
					? 'Catch It'
					: 'Planned'
	if (missing)
		return (
			<Tooltip title={result.reason ?? ''}>
				<Chip size="small" color="warning" variant="outlined" label={`${label}, ${missing} Missing`} />
			</Tooltip>
		)
	return <Chip size="small" color="primary" variant="outlined" label={label} />
}

export function ListsPanel({
	plan,
	selectedWanted,
	onSelectWanted
}: {
	plan: Plan | null
	selectedWanted: string | null
	onSelectWanted: (uid: string) => void
}) {
	const store = useStore()
	const gamePals = useGamePals()
	const [tab, setTab] = useState<'wanted' | 'owned'>('wanted')
	const [view, setView] = useState<'list' | 'game'>('list')
	const [draft, setDraft] = useState<Draft>(emptyDraft)
	const [search, setSearch] = useState('')

	const results = useMemo(() => new Map(plan?.targets.map((t) => [t.wantedUid, t])), [plan])
	const owned = useMemo(() => filterAndSort(store.owned, search), [store.owned, search])
	const shownGamePals = useMemo(() => filterAndSort(gamePals, search), [gamePals, search])
	const addPlan = useMemo(() => planAdd(store.owned, gamePals), [store.owned, gamePals])
	const pending = addPlan.links.size + addPlan.adds.length
	const gameView = tab === 'owned' && view === 'game' && gamePals.length > 0

	const switchTab = (next: 'wanted' | 'owned') => {
		setTab(next)
		setDraft(emptyDraft)
	}

	const submit = () => {
		if (!draft.palId) return
		if (tab === 'wanted') {
			const entry = { palId: draft.palId, passives: draft.passives }
			if (draft.uid) store.updateWanted({ ...entry, uid: draft.uid })
			else store.addWanted(entry)
		} else {
			const entry = { palId: draft.palId, gender: draft.gender, passives: draft.passives, stars: draft.palId === YAKUMO_ID ? draft.stars : undefined }
			if (draft.uid) store.updateOwned({ ...entry, uid: draft.uid })
			else store.addOwned(entry)
		}
		// Keep the gender for quick entry of several pals in a row
		setDraft({ ...emptyDraft, gender: draft.gender })
	}

	return (
		<Paper variant="outlined" sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%' }}>
			<Tabs value={tab} onChange={(_, v) => switchTab(v)} sx={{ borderBottom: 1, borderColor: 'divider', px: 1 }}>
				<Tab value="wanted" label={`Target Pals (${store.wanted.length})`} />
				<Tab value="owned" label={`My Pals (${store.owned.length})`} />
			</Tabs>
			{tab === 'owned' && gamePals.length > 0 && (
				<Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 1, borderBottom: 1, borderColor: 'divider' }}>
					<ToggleButtonGroup size="small" exclusive value={view} onChange={(_, v: 'list' | 'game' | null) => v && setView(v)}>
						<ToggleButton value="list">My List</ToggleButton>
						<Tooltip title="Your party and every Palbox page you've opened this session">
							<ToggleButton value="game">In Game ({gamePals.length})</ToggleButton>
						</Tooltip>
					</ToggleButtonGroup>
					<Box sx={{ flex: 1 }} />
					<Button size="small" variant="outlined" startIcon={<AddIcon />} disabled={!pending} onClick={() => store.addFromGame(gamePals)}>
						Add All ({pending})
					</Button>
				</Box>
			)}
			{!gameView && <EntryForm withGender={tab === 'owned'} draft={draft} setDraft={setDraft} onSubmit={submit} />}
			{tab === 'owned' && (gameView ? gamePals.length : store.owned.length) > 8 && (
				<Box sx={{ px: 1.5, py: 1, borderBottom: 1, borderColor: 'divider' }}>
					<TextField
						size="small"
						fullWidth
						placeholder="Filter by pal or passive"
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						slotProps={{
							input: {
								startAdornment: (
									<InputAdornment position="start">
										<SearchIcon fontSize="small" />
									</InputAdornment>
								)
							}
						}}
					/>
				</Box>
			)}
			<LazyScroll>
				{tab === 'wanted' &&
					store.wanted.map((w) => (
						<Row
							key={w.uid}
							palId={w.palId}
							passives={w.passives}
							status={<StatusChip result={results.get(w.uid)} />}
							selected={selectedWanted === w.uid}
							enabled={!w.disabled}
							onToggle={() => store.toggleWantedDisabled(w.uid)}
							onClick={() => onSelectWanted(w.uid)}
							onEdit={() => setDraft({ uid: w.uid, palId: w.palId, gender: 'M', passives: w.passives, stars: 0 })}
							onDelete={() => store.removeWanted(w.uid)}
						/>
					))}
				{tab === 'owned' &&
					!gameView &&
					owned.map((o) => (
						<LazyItem key={o.uid} estimate={rowEstimate(o.passives)}>
							<Row
								palId={o.palId}
								gender={o.gender}
								passives={o.passives}
								stars={o.stars}
								onEdit={() => setDraft({ uid: o.uid, palId: o.palId, gender: o.gender, passives: o.passives, stars: o.stars ?? 0 })}
								onDelete={() => store.removeOwned(o.uid)}
							/>
						</LazyItem>
					))}
				{gameView &&
					shownGamePals.map((g) => (
						<LazyItem key={g.key} estimate={rowEstimate(g.passives)}>
							<GameRow pal={g} added={addPlan.linked.has(g.key)} onAdd={() => store.addFromGame([g])} />
						</LazyItem>
					))}
				{tab === 'wanted' && !store.wanted.length && (
					<Empty text="Add the pals you want to breed. You can also star them in the Paldeck." />
				)}
				{tab === 'owned' && !gameView && !store.owned.length && (
					<Empty text="Add the pals you have, with their gender and passives, so plans can start from them." />
				)}
			</LazyScroll>
		</Paper>
	)
}

/** Pals whose name or a passive contains the search, by name */
function filterAndSort<T extends { palId: string; passives: string[] }>(list: T[], search: string): T[] {
	const q = search.trim().toLowerCase()
	return list
		.filter((o) => !q || getPal(o.palId).name.toLowerCase().includes(q) || o.passives.some((p) => p.toLowerCase().includes(q)))
		.sort((a, b) => getPal(a.palId).name.localeCompare(getPal(b.palId).name))
}

function Empty({ text }: { text: string }) {
	return (
		<Typography variant="body2" color="text.secondary" sx={{ p: 3, textAlign: 'center' }}>
			{text}
		</Typography>
	)
}
