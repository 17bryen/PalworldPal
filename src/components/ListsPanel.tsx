import { memo, useCallback, useDeferredValue, useMemo, useState } from 'react'
import {
	Box,
	Button,
	Dialog,
	DialogActions,
	DialogContent,
	DialogContentText,
	DialogTitle,
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
import RestoreIcon from '@mui/icons-material/RestoreFromTrash'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import { getPal, YAKUMO_ID, type Gender } from '../data/gamedata'
import { useGamePals } from '../state/bridge'
import { describeLocation, ownedLocation, planAdd, type GamePal, type PalLocation } from '../state/gamepals'
import { useActions, useStoreSelect } from '../state/store'
import type { OwnedPal, Plan, PlanNode, TargetResult } from '../solver/types'
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
	onDelete,
	location
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
	/** Where the pal is in the game, shown when hovering its portrait or name */
	location?: string
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
			<Located location={location}>
				<PalAvatar palId={palId} />
			</Located>
			<Box sx={{ flex: 1, minWidth: 0 }}>
				<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: passives.length ? 0.5 : 0 }}>
					<Located location={location}>
						<Typography variant="body2" fontWeight={600} noWrap>
							{getPal(palId).name}
						</Typography>
					</Located>
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

/** Shows where a pal is in the game when hovered; passes children through when that isn't known */
function Located({ location, children }: { location?: string; children: React.ReactElement }) {
	if (!location) return children
	return (
		<Tooltip title={location} placement="top-start">
			<Box component="span" sx={{ display: 'inline-flex', minWidth: 0, cursor: 'help' }}>
				{children}
			</Box>
		</Tooltip>
	)
}

function GameRow({ pal, onAdd }: { pal: GamePal; onAdd: () => void }) {
	return (
		<Box
			sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 1.5, py: 1, borderBottom: 1, borderColor: 'divider', '&:hover': { bgcolor: 'action.hover' } }}
		>
			<Located location={pal.where && describeLocation(pal.where)}>
				<PalAvatar palId={pal.palId} />
			</Located>
			<Box sx={{ flex: 1, minWidth: 0 }}>
				<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: pal.passives.length ? 0.5 : 0 }}>
					<Located location={pal.where && describeLocation(pal.where)}>
						<Typography variant="body2" fontWeight={600} noWrap>
							{getPal(pal.palId).name}
						</Typography>
					</Located>
					<GenderIcon gender={pal.gender} size={16} />
				</Box>
				<PassiveList passives={pal.passives} />
			</Box>
			<Tooltip title="Add to My Pals">
				<IconButton size="small" onClick={onAdd}>
					<AddIcon fontSize="small" />
				</IconButton>
			</Tooltip>
		</Box>
	)
}

const rowEstimate = (passives: string[]) => (passives.length ? 65 : 49)

/** One My Pals row; re-renders only when its pal or the game's pal list changes */
const OwnedRow = memo(function OwnedRow({
	pal,
	whereByKey,
	onEdit,
	onDelete
}: {
	pal: OwnedPal
	whereByKey: Map<string, PalLocation | undefined>
	onEdit: (pal: OwnedPal) => void
	onDelete: (uid: string) => void
}) {
	return (
		<Row
			palId={pal.palId}
			gender={pal.gender}
			passives={pal.passives}
			stars={pal.stars}
			onEdit={() => onEdit(pal)}
			onDelete={() => onDelete(pal.uid)}
			location={ownedLocation(pal, whereByKey)}
		/>
	)
})

const nameOf = (palId: string) => getPal(palId).name
const collator = new Intl.Collator()

/** Sorted by name once per change to the list, not on every keystroke in the search box */
function sortByName<T extends { palId: string }>(list: T[]): T[] {
	return list.map((o) => [nameOf(o.palId), o] as const).sort((a, b) => collator.compare(a[0], b[0])).map(([, o]) => o)
}

/** Pals whose name or a passive contains the search */
function matching<T extends { palId: string; passives: string[] }>(list: T[], search: string): T[] {
	const q = search.trim().toLowerCase()
	if (!q) return list
	return list.filter((o) => nameOf(o.palId).toLowerCase().includes(q) || o.passives.some((p) => p.toLowerCase().includes(q)))
}

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

export const ListsPanel = memo(function ListsPanel({
	plan,
	selectedWanted,
	onSelectWanted
}: {
	plan: Plan | null
	selectedWanted: string | null
	onSelectWanted: (uid: string) => void
}) {
	const allOwned = useStoreSelect((s) => s.owned)
	const wanted = useStoreSelect((s) => s.wanted)
	const removed = useStoreSelect((s) => s.removed)
	const actions = useActions()
	const gamePals = useGamePals()
	const [tab, setTab] = useState<'wanted' | 'owned'>('wanted')
	const [source, setSource] = useState<'all' | 'hand' | 'synced'>('all')
	const [draft, setDraft] = useState<Draft>(emptyDraft)
	const [search, setSearch] = useState('')

	const results = useMemo(() => new Map(plan?.targets.map((t) => [t.wantedUid, t])), [plan])
	const handCount = useMemo(() => allOwned.filter((o) => !o.game).length, [allOwned])
	// The list keeps up with typing; filtering waits a beat when it falls behind
	const query = useDeferredValue(search)
	const [confirmRemove, setConfirmRemove] = useState(false)
	const [showRemoved, setShowRemoved] = useState(false)
	// Everything in the chosen view, regardless of the search box
	const inView = useMemo(
		() => (source === 'all' ? allOwned : allOwned.filter((o) => (source === 'hand' ? !o.game : !!o.game))),
		[allOwned, source]
	)
	const sorted = useMemo(() => sortByName(inView), [inView])
	const viewName = source === 'all' ? 'pals from My Pals' : source === 'hand' ? 'hand-added pals' : 'game-synced pals'
	const owned = useMemo(() => matching(sorted, query), [sorted, query])
	const addPlan = useMemo(() => planAdd(allOwned, gamePals), [allOwned, gamePals])
	const whereByKey = useMemo(() => new Map(gamePals.map((g) => [g.key, g.where])), [gamePals])
	const pending = addPlan.links.size + addPlan.adds.length
	// Pals seen in the game this session that aren't in My Pals yet, listed under Game Synced
	const notAddedAll = useMemo(
		() => (source === 'synced' ? sortByName(gamePals.filter((g) => !addPlan.linked.has(g.key))) : []),
		[source, gamePals, addPlan]
	)
	const notAdded = useMemo(() => matching(notAddedAll, query), [notAddedAll, query])
	const editOwned = useCallback((o: OwnedPal) => setDraft({ uid: o.uid, palId: o.palId, gender: o.gender, passives: o.passives, stars: o.stars ?? 0 }), [])

	const switchTab = (next: 'wanted' | 'owned') => {
		setTab(next)
		setDraft(emptyDraft)
	}

	const submit = () => {
		if (!draft.palId) return
		if (tab === 'wanted') {
			const entry = { palId: draft.palId, passives: draft.passives }
			if (draft.uid) actions.updateWanted({ ...entry, uid: draft.uid })
			else actions.addWanted(entry)
		} else {
			const entry = { palId: draft.palId, gender: draft.gender, passives: draft.passives, stars: draft.palId === YAKUMO_ID ? draft.stars : undefined }
			if (draft.uid) actions.updateOwned({ ...entry, uid: draft.uid })
			else actions.addOwned(entry)
		}
		// Keep the gender for quick entry of several pals in a row
		setDraft({ ...emptyDraft, gender: draft.gender })
	}

	return (
		<Paper variant="outlined" sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%' }}>
			<Tabs value={tab} onChange={(_, v) => switchTab(v)} sx={{ borderBottom: 1, borderColor: 'divider', px: 1 }}>
				<Tab value="wanted" label={`Target Pals (${wanted.length})`} />
				<Tab value="owned" label={`My Pals (${allOwned.length})`} />
			</Tabs>
			{tab === 'owned' && (
				<Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 1, borderBottom: 1, borderColor: 'divider' }}>
					<ToggleButtonGroup size="small" exclusive value={source} onChange={(_, v: 'all' | 'hand' | 'synced' | null) => v && setSource(v)}>
						<ToggleButton value="all">All</ToggleButton>
						<ToggleButton value="hand">Hand Added ({handCount})</ToggleButton>
						<ToggleButton value="synced">Game Synced ({allOwned.length - handCount})</ToggleButton>
					</ToggleButtonGroup>
					<Box sx={{ flex: 1 }} />
					{inView.length > 0 && (
						<Button size="small" color="error" onClick={() => setConfirmRemove(true)}>
							Remove All
						</Button>
					)}
					{source === 'synced' && gamePals.length > 0 && (
						<Tooltip title="Your party and every Palbox page you've opened this session">
							<span>
								<Button size="small" variant="outlined" startIcon={<AddIcon />} disabled={!pending} onClick={() => actions.addFromGame(gamePals)}>
									Add All ({pending})
								</Button>
							</span>
						</Tooltip>
					)}
				</Box>
			)}
			{!(tab === 'owned' && source === 'synced') && <EntryForm withGender={tab === 'owned'} draft={draft} setDraft={setDraft} onSubmit={submit} />}
			{tab === 'owned' && allOwned.length + notAddedAll.length > 8 && (
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
					wanted.map((w) => (
						<Row
							key={w.uid}
							palId={w.palId}
							passives={w.passives}
							status={<StatusChip result={results.get(w.uid)} />}
							selected={selectedWanted === w.uid}
							enabled={!w.disabled}
							onToggle={() => actions.toggleWantedDisabled(w.uid)}
							onClick={() => onSelectWanted(w.uid)}
							onEdit={() => setDraft({ uid: w.uid, palId: w.palId, gender: 'M', passives: w.passives, stars: 0 })}
							onDelete={() => actions.removeWanted(w.uid)}
						/>
					))}
				{tab === 'owned' &&
					owned.map((o) => (
						<LazyItem key={o.uid} estimate={rowEstimate(o.passives)}>
							<OwnedRow pal={o} whereByKey={whereByKey} onEdit={editOwned} onDelete={actions.removeOwned} />
						</LazyItem>
					))}
				{tab === 'owned' && notAdded.length > 0 && (
					<Typography variant="overline" color="text.secondary" component="div" sx={{ px: 1.5, pt: 1.5 }}>
						Seen in Game, Not Added ({notAdded.length})
					</Typography>
				)}
				{tab === 'owned' &&
					notAdded.map((g) => (
						<LazyItem key={g.key} estimate={rowEstimate(g.passives)}>
							<GameRow pal={g} onAdd={() => actions.addFromGame([g])} />
						</LazyItem>
					))}
				{tab === 'owned' && source !== 'hand' && removed.length > 0 && (
					<Box sx={{ borderTop: 1, borderColor: 'divider', mt: 1 }}>
						<Box sx={{ display: 'flex', alignItems: 'center', px: 1.5, pt: 1 }}>
							<Tooltip
								title="Synced pals that left your party and Palbox and didn't turn up anywhere else, so they were most likely sold, condensed or traded. They come back on their own if the game shows them again."
								placement="top-start"
							>
								<Box onClick={() => setShowRemoved((v) => !v)} sx={{ display: 'flex', alignItems: 'center', flex: 1, cursor: 'pointer', userSelect: 'none' }}>
									<Typography variant="overline" color="text.secondary">
										Recently Removed ({removed.length})
									</Typography>
									<ExpandMoreIcon fontSize="small" sx={{ color: 'text.secondary', transform: showRemoved ? 'none' : 'rotate(-90deg)', transition: 'transform 150ms' }} />
								</Box>
							</Tooltip>
							{showRemoved && (
								<Button size="small" onClick={actions.clearRemoved}>
									Clear
								</Button>
							)}
						</Box>
						{showRemoved &&
							removed.map((r) => (
								<Box key={r.uid} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 1.5, py: 1, borderBottom: 1, borderColor: 'divider', opacity: 0.75 }}>
									<PalAvatar palId={r.palId} />
									<Box sx={{ flex: 1, minWidth: 0 }}>
										<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: r.passives.length ? 0.5 : 0 }}>
											<Typography variant="body2" fontWeight={600} noWrap>
												{r.name ?? getPal(r.palId).name}
											</Typography>
											<GenderIcon gender={r.gender} size={16} />
											<Typography variant="caption" color="text.secondary" sx={{ ml: 0.5 }} noWrap>
												{new Date(r.removedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
											</Typography>
										</Box>
										<PassiveList passives={r.passives} />
									</Box>
									<Tooltip title="Put Back in My Pals">
										<IconButton size="small" onClick={() => actions.restoreRemoved(r.uid)}>
											<RestoreIcon fontSize="small" />
										</IconButton>
									</Tooltip>
								</Box>
							))}
					</Box>
				)}
				{tab === 'wanted' && !wanted.length && (
					<Empty text="Add the pals you want to breed. You can also star them in the Paldeck." />
				)}
				{tab === 'owned' && !owned.length && !notAdded.length && (
					<Empty
						text={
							source === 'hand'
								? 'No pals added by hand.'
								: source === 'synced'
									? 'No pals from the game yet. With Game Link connected, open your Palbox in the game.'
									: 'Add the pals you have, with their gender and passives, so plans can start from them.'
						}
					/>
				)}
			</LazyScroll>
			<Dialog open={confirmRemove} onClose={() => setConfirmRemove(false)}>
				<DialogTitle>Remove All</DialogTitle>
				<DialogContent>
					<DialogContentText>
						This will remove all {inView.length} {viewName}.{source !== 'hand' && ' Pals from the game can be added back with Add All once their Palbox pages are open.'}
					</DialogContentText>
				</DialogContent>
				<DialogActions>
					<Button onClick={() => setConfirmRemove(false)}>Cancel</Button>
					<Button
						color="error"
						variant="contained"
						onClick={() => {
							actions.removeOwnedMany(inView.map((o) => o.uid))
							setConfirmRemove(false)
						}}
					>
						Remove {inView.length}
					</Button>
				</DialogActions>
			</Dialog>
		</Paper>
	)
})

function Empty({ text }: { text: string }) {
	return (
		<Typography variant="body2" color="text.secondary" sx={{ p: 3, textAlign: 'center' }}>
			{text}
		</Typography>
	)
}
