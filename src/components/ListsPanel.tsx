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
import { getPal, YAKUMO_ID, type Gender } from '../data/gamedata'
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

const rowEstimate = (passives: string[]) => (passives.length ? 65 : 49)

/** One hand-added pal; re-renders only when that pal changes */
const OwnedRow = memo(function OwnedRow({ pal, onEdit, onDelete }: { pal: OwnedPal; onEdit: (pal: OwnedPal) => void; onDelete: (uid: string) => void }) {
	return (
		<Row
			palId={pal.palId}
			gender={pal.gender}
			passives={pal.passives}
			stars={pal.stars}
			onEdit={() => onEdit(pal)}
			onDelete={() => onDelete(pal.uid)}
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
	const actions = useActions()
	const [tab, setTab] = useState<'wanted' | 'owned'>('wanted')
	const [draft, setDraft] = useState<Draft>(emptyDraft)
	const [search, setSearch] = useState('')
	const [confirmRemove, setConfirmRemove] = useState(false)

	const results = useMemo(() => new Map(plan?.targets.map((t) => [t.wantedUid, t])), [plan])
	// Pals from the game live in the Palbox tab; this list is the ones typed in by hand
	const handAdded = useMemo(() => allOwned.filter((o) => !o.game), [allOwned])
	const syncedCount = allOwned.length - handAdded.length
	const sorted = useMemo(() => sortByName(handAdded), [handAdded])
	// The list keeps up with typing; filtering waits a beat when it falls behind
	const query = useDeferredValue(search)
	const owned = useMemo(() => matching(sorted, query), [sorted, query])
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
				<Tab value="owned" label={`Hand Added Pals (${handAdded.length})`} />
			</Tabs>
			{tab === 'owned' && (syncedCount > 0 || handAdded.length > 0) && (
				<Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 1, borderBottom: 1, borderColor: 'divider' }}>
					<Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
						{syncedCount > 0 && `Plans also use your ${syncedCount} pals synced from the game, in the Palbox tab.`}
					</Typography>
					{handAdded.length > 0 && (
						<Button size="small" color="error" onClick={() => setConfirmRemove(true)}>
							Remove All
						</Button>
					)}
				</Box>
			)}
			<EntryForm withGender={tab === 'owned'} draft={draft} setDraft={setDraft} onSubmit={submit} />
			{tab === 'owned' && handAdded.length > 8 && (
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
							<OwnedRow pal={o} onEdit={editOwned} onDelete={actions.removeOwned} />
						</LazyItem>
					))}
				{tab === 'wanted' && !wanted.length && <Empty text="Add the pals you want to breed. You can also star them in the Paldeck." />}
				{tab === 'owned' && !owned.length && (
					<Empty
						text={
							handAdded.length
								? 'No pal matches.'
								: 'Add pals the game link can\'t see, with their gender and passives, so plans can start from them.'
						}
					/>
				)}
			</LazyScroll>
			<Dialog open={confirmRemove} onClose={() => setConfirmRemove(false)}>
				<DialogTitle>Remove All</DialogTitle>
				<DialogContent>
					<DialogContentText>This will remove all {handAdded.length} hand-added pals.</DialogContentText>
				</DialogContent>
				<DialogActions>
					<Button onClick={() => setConfirmRemove(false)}>Cancel</Button>
					<Button
						color="error"
						variant="contained"
						onClick={() => {
							actions.removeOwnedMany(handAdded.map((o) => o.uid))
							setConfirmRemove(false)
						}}
					>
						Remove {handAdded.length}
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
