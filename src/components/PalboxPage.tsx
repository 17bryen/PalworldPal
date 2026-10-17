import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import {
	Badge,
	Box,
	Button,
	ButtonBase,
	Dialog,
	DialogActions,
	DialogContent,
	DialogContentText,
	DialogTitle,
	IconButton,
	InputAdornment,
	MenuItem,
	Paper,
	TextField,
	ToggleButton,
	ToggleButtonGroup,
	Tooltip,
	Typography
} from '@mui/material'
import SearchIcon from '@mui/icons-material/Search'
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import AddIcon from '@mui/icons-material/Add'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import RestoreIcon from '@mui/icons-material/RestoreFromTrash'
import CloverIcon from '@mui/icons-material/Spa'
import CrownIcon from '@mui/icons-material/WorkspacePremium'
import { getPal, WORK_KINDS, type Gender, type WorkKind } from '../data/gamedata'
import { useGamePals } from '../state/bridge'
import { describeLocation, planAdd } from '../state/gamepals'
import {
	buildBox,
	emptyFilter,
	filterActive,
	matchesFilter,
	PAGE_COLUMNS,
	PAGE_COUNT,
	pageOf,
	PARTY_SLOTS,
	type BoxFilter,
	type BoxPal
} from '../state/palbox'
import { useActions, useStoreSelect } from '../state/store'
import { GenderIcon, PalAvatar, PassiveList, WORK_INFO, WorkIcon } from './bits'
import { PassivePicker } from './pickers'
import { LazyItem, LazyScroll } from './lazy'

const asset = (file: string) => `${import.meta.env.BASE_URL}${file}`
const ELEMENTS = ['Neutral', 'Fire', 'Water', 'Grass', 'Electric', 'Ice', 'Ground', 'Dark', 'Dragon']
const CELL = 74
const GAP = 6
const lucky = (p: BoxPal) => p.passives.includes('Lucky')

function where(p: BoxPal): string {
	if (!p.where) return 'Spot not known'
	return p.live ? describeLocation(p.where) : `Last Seen: ${describeLocation(p.where)}`
}

function PalTip({ pal }: { pal: BoxPal }) {
	return (
		<Box sx={{ p: 0.5, maxWidth: 280 }}>
			<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
				<Typography variant="body2" fontWeight={700}>
					{pal.name ?? getPal(pal.palId).name}
				</Typography>
				<GenderIcon gender={pal.gender} size={15} />
				{pal.level != null && (
					<Typography variant="caption" sx={{ ml: 0.5 }}>
						Lv {pal.level}
					</Typography>
				)}
			</Box>
			{pal.name && (
				<Typography variant="caption" color="text.secondary" component="div">
					{getPal(pal.palId).name}
				</Typography>
			)}
			{pal.passives.length > 0 && (
				<Box sx={{ mt: 0.75 }}>
					<PassiveList passives={pal.passives} />
				</Box>
			)}
			<Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 0.75 }}>
				{where(pal)}
				{!pal.added && ' (not in My Pals yet)'}
			</Typography>
		</Box>
	)
}

/** One party or Palbox slot */
const Slot = memo(function Slot({ pal, dim, flash }: { pal: BoxPal | null; dim: boolean; flash: boolean }) {
	const base = {
		width: CELL,
		height: CELL,
		borderRadius: 1.5,
		border: 1,
		borderColor: 'divider',
		bgcolor: 'rgba(255,255,255,0.03)',
		position: 'relative' as const,
		transition: 'opacity 150ms, box-shadow 200ms'
	}
	if (!pal) return <Box sx={base} />
	return (
		<Tooltip title={<PalTip pal={pal} />} placement="top" enterDelay={250}>
			<Box
				sx={{
					...base,
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					opacity: dim ? 0.22 : 1,
					// Seen this session but not in My Pals yet
					borderStyle: pal.added ? 'solid' : 'dashed',
					borderColor: flash ? 'primary.main' : pal.alpha ? '#f07a7a' : lucky(pal) ? '#f0c35c' : pal.added ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.35)',
					boxShadow: flash ? (t) => `0 0 0 2px ${t.palette.primary.main}, 0 0 18px ${t.palette.primary.main}` : 'none'
				}}
			>
				<PalAvatar palId={pal.palId} size={52} />
				{pal.level != null && (
					<Box sx={{ position: 'absolute', left: 3, bottom: 1, fontSize: 11, fontWeight: 800, textShadow: '0 1px 2px #000' }}>Lv {pal.level}</Box>
				)}
				<Box sx={{ position: 'absolute', right: 1, top: 1, display: 'flex' }}>
					<GenderIcon gender={pal.gender} size={14} />
				</Box>
				<Box sx={{ position: 'absolute', left: 2, top: 1, display: 'flex' }}>
					{pal.alpha && <CrownIcon sx={{ fontSize: 14, color: '#f07a7a' }} />}
					{lucky(pal) && <CloverIcon sx={{ fontSize: 14, color: '#f0c35c' }} />}
				</Box>
			</Box>
		</Tooltip>
	)
})

function Filters({ filter, setFilter }: { filter: BoxFilter; setFilter: (f: BoxFilter) => void }) {
	const set = (patch: Partial<BoxFilter>) => setFilter({ ...filter, ...patch })
	return (
		<Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
			<TextField
				size="small"
				placeholder="Search by species or nickname"
				value={filter.text}
				onChange={(e) => set({ text: e.target.value })}
				sx={{ width: 250 }}
				slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }}
			/>
			<TextField select size="small" label="Type" value={filter.element ?? ''} onChange={(e) => set({ element: e.target.value || null })} sx={{ width: 140 }}>
				<MenuItem value="">Any</MenuItem>
				{ELEMENTS.map((el) => (
					<MenuItem key={el} value={el}>
						<Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
							<img src={asset(`elements/${el}.webp`)} alt="" width={18} height={18} />
							{el}
						</Box>
					</MenuItem>
				))}
			</TextField>
			<TextField select size="small" label="Work" value={filter.work ?? ''} onChange={(e) => set({ work: (e.target.value || null) as WorkKind | null })} sx={{ width: 210 }}>
				<MenuItem value="">Any</MenuItem>
				{WORK_KINDS.map((w) => (
					<MenuItem key={w} value={w}>
						<Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
							<WorkIcon kind={w} size={18} />
							{WORK_INFO[w].label}
						</Box>
					</MenuItem>
				))}
			</TextField>
			<Box sx={{ width: 300 }}>
				<PassivePicker value={filter.passives} onChange={(passives) => set({ passives })} />
			</Box>
			<ToggleButtonGroup size="small" exclusive value={filter.gender ?? 'any'} onChange={(_, v: Gender | 'any' | null) => v && set({ gender: v === 'any' ? null : v })}>
				<ToggleButton value="any">Any</ToggleButton>
				<ToggleButton value="M" title="Male">
					<GenderIcon gender="M" size={18} />
				</ToggleButton>
				<ToggleButton value="F" title="Female">
					<GenderIcon gender="F" size={18} />
				</ToggleButton>
			</ToggleButtonGroup>
			{filterActive(filter) && (
				<Button size="small" onClick={() => setFilter(emptyFilter)}>
					Clear Filters
				</Button>
			)}
		</Box>
	)
}

/** A matching pal in the list beside the Palbox; clicking jumps to it */
const ResultRow = memo(function ResultRow({ pal, onJump }: { pal: BoxPal; onJump: (pal: BoxPal) => void }) {
	const jumpable = pal.where?.box === 'party' || pal.where?.box === 'palbox'
	return (
		<ButtonBase
			disabled={!jumpable}
			onClick={() => onJump(pal)}
			sx={{ display: 'flex', width: '100%', justifyContent: 'flex-start', textAlign: 'left', gap: 1.25, px: 1.5, py: 0.75, borderBottom: 1, borderColor: 'divider', '&:hover': { bgcolor: 'action.hover' } }}
		>
			<PalAvatar palId={pal.palId} size={34} />
			<Box sx={{ flex: 1, minWidth: 0 }}>
				<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
					<Typography variant="body2" fontWeight={600} noWrap>
						{pal.name ?? getPal(pal.palId).name}
					</Typography>
					<GenderIcon gender={pal.gender} size={15} />
					{pal.level != null && (
						<Typography variant="caption" color="text.secondary">
							Lv {pal.level}
						</Typography>
					)}
				</Box>
				<Typography variant="caption" color={pal.live ? 'text.secondary' : 'warning.main'} noWrap component="div">
					{where(pal)}
				</Typography>
			</Box>
			{pal.passives.length > 0 && (
				<Box sx={{ maxWidth: '45%', display: 'flex', justifyContent: 'flex-end' }}>
					<PassiveList passives={pal.passives} />
				</Box>
			)}
		</ButtonBase>
	)
})

function RecentlyRemoved() {
	const removed = useStoreSelect((s) => s.removed)
	const { restoreRemoved, clearRemoved } = useActions()
	const [open, setOpen] = useState(false)
	if (!removed.length) return null
	return (
		<Box sx={{ borderTop: 1, borderColor: 'divider' }}>
			<Box sx={{ display: 'flex', alignItems: 'center', px: 1.5, py: 0.5 }}>
				<Tooltip
					title="Synced pals that left your party and Palbox and didn't turn up anywhere else, so they were most likely sold, condensed or traded. They come back on their own if the game shows them again."
					placement="top-start"
				>
					<Box onClick={() => setOpen((v) => !v)} sx={{ display: 'flex', alignItems: 'center', flex: 1, cursor: 'pointer', userSelect: 'none' }}>
						<Typography variant="overline" color="text.secondary">
							Recently Removed ({removed.length})
						</Typography>
						<ExpandMoreIcon fontSize="small" sx={{ color: 'text.secondary', transform: open ? 'none' : 'rotate(-90deg)', transition: 'transform 150ms' }} />
					</Box>
				</Tooltip>
				{open && (
					<Button size="small" onClick={clearRemoved}>
						Clear
					</Button>
				)}
			</Box>
			{open && (
				<Box sx={{ maxHeight: 240, overflowY: 'auto' }}>
					{removed.map((r) => (
						<Box key={r.uid} sx={{ display: 'flex', alignItems: 'center', gap: 1.25, px: 1.5, py: 0.75, borderTop: 1, borderColor: 'divider', opacity: 0.75 }}>
							<PalAvatar palId={r.palId} size={30} />
							<Box sx={{ flex: 1, minWidth: 0 }}>
								<Typography variant="body2" fontWeight={600} noWrap>
									{r.name ?? getPal(r.palId).name}
								</Typography>
								<Typography variant="caption" color="text.secondary">
									{new Date(r.removedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
								</Typography>
							</Box>
							<Tooltip title="Put Back in My Pals">
								<IconButton size="small" onClick={() => restoreRemoved(r.uid)}>
									<RestoreIcon fontSize="small" />
								</IconButton>
							</Tooltip>
						</Box>
					))}
				</Box>
			)}
		</Box>
	)
}

export function PalboxPage() {
	const owned = useStoreSelect((s) => s.owned)
	const { addFromGame, removeOwnedMany } = useActions()
	const gamePals = useGamePals()
	const [page, setPage] = useState(0)
	const [filter, setFilter] = useState<BoxFilter>(emptyFilter)
	const [flash, setFlash] = useState<string | null>(null)
	const [confirmRemove, setConfirmRemove] = useState(false)
	const flashTimer = useRef<ReturnType<typeof setTimeout>>()
	useEffect(() => () => clearTimeout(flashTimer.current), [])

	const addPlan = useMemo(() => planAdd(owned, gamePals), [owned, gamePals])
	const view = useMemo(() => buildBox(owned, gamePals, addPlan.linked), [owned, gamePals, addPlan])
	const pending = addPlan.links.size + addPlan.adds.length
	const synced = useMemo(() => owned.filter((o) => o.game), [owned])

	// Matching keeps up with typing; the grid and list catch up a beat later when it falls behind
	const deferred = useDeferredValue(filter)
	const searching = filterActive(deferred)
	const matches = useMemo(() => (searching ? view.all.filter((p) => matchesFilter(p, deferred)) : view.all), [view, deferred, searching])
	const matchKeys = useMemo(() => (searching ? new Set(matches.map((p) => p.key)) : null), [matches, searching])
	const pageMatches = useMemo(() => {
		const counts = Array(PAGE_COUNT).fill(0)
		if (matchKeys) for (const p of matches) if (p.where?.box === 'palbox') counts[pageOf(p.where.slot)]++
		return counts
	}, [matches, matchKeys])
	const partyMatches = matchKeys ? view.party.filter((p) => p && matchKeys.has(p.key)).length : 0

	const jump = useCallback((pal: BoxPal) => {
		if (pal.where?.box === 'palbox') setPage(pageOf(pal.where.slot))
		setFlash(pal.key)
		clearTimeout(flashTimer.current)
		flashTimer.current = setTimeout(() => setFlash(null), 1800)
	}, [])

	const dimOf = (p: BoxPal | null) => !!p && !!matchKeys && !matchKeys.has(p.key)
	const stale = view.stale.has(page)

	return (
		<Paper variant="outlined" sx={{ height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
			<Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1.5, borderBottom: 1, borderColor: 'divider' }}>
				<Box sx={{ flex: 1 }}>
					<Filters filter={filter} setFilter={setFilter} />
				</Box>
				{pending > 0 && (
					<Tooltip title="Your party and every Palbox page you've opened this session">
						<Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={() => addFromGame(gamePals)} sx={{ whiteSpace: 'nowrap' }}>
							Add All to My Pals ({pending})
						</Button>
					</Tooltip>
				)}
				{synced.length > 0 && (
					<Button size="small" color="error" onClick={() => setConfirmRemove(true)} sx={{ whiteSpace: 'nowrap' }}>
						Remove All
					</Button>
				)}
			</Box>

			{!view.all.length ? (
				<Typography variant="body2" color="text.secondary" sx={{ p: 4, textAlign: 'center' }}>
					Your Palbox shows up here once the game link is connected. Open your Palbox pages in the game to sync them.
				</Typography>
			) : (
				<Box sx={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: `auto auto minmax(320px, 1fr)`, gap: 3, p: 2 }}>
					<Box>
						<Box sx={{ display: 'flex', alignItems: 'center', gap: 1, height: 34, mb: 1 }}>
							<Typography variant="subtitle2">Party</Typography>
							{partyMatches > 0 && <Badge color="primary" badgeContent={partyMatches} sx={{ ml: 1.5 }} />}
						</Box>
						<Box sx={{ display: 'flex', flexDirection: 'column', gap: `${GAP}px` }}>
							{Array.from({ length: PARTY_SLOTS }, (_, i) => {
								const p = view.party[i]
								return <Slot key={i} pal={p} dim={dimOf(p)} flash={!!p && p.key === flash} />
							})}
						</Box>
					</Box>

					<Box>
						<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, height: 34, mb: 1 }}>
							<IconButton size="small" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
								<ChevronLeftIcon />
							</IconButton>
							<Typography variant="subtitle2" sx={{ minWidth: 92, textAlign: 'center' }}>
								Page {page + 1} of {PAGE_COUNT}
							</Typography>
							<IconButton size="small" disabled={page === PAGE_COUNT - 1} onClick={() => setPage((p) => p + 1)}>
								<ChevronRightIcon />
							</IconButton>
						</Box>
						<Box sx={{ position: 'relative' }}>
							<Box
								sx={{
									display: 'grid',
									gridTemplateColumns: `repeat(${PAGE_COLUMNS}, ${CELL}px)`,
									gap: `${GAP}px`,
									opacity: stale ? 0.4 : 1,
									filter: stale ? 'grayscale(0.6)' : 'none'
								}}
							>
								{view.pages[page].map((p, i) => (
									<Slot key={i} pal={p} dim={dimOf(p)} flash={!!p && p.key === flash} />
								))}
							</Box>
							{stale && (
								<Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
									<Box sx={{ px: 2, py: 1.25, borderRadius: 2, bgcolor: 'rgba(14,16,20,0.88)', border: 1, borderColor: 'divider', textAlign: 'center' }}>
										<Typography variant="body2" fontWeight={700}>
											Open this page in the game to sync it
										</Typography>
										<Typography variant="caption" color="text.secondary">
											Showing your last sync
										</Typography>
									</Box>
								</Box>
							)}
						</Box>
						{/* Every page at a glance: which have pals, which are out of date, where the matches are */}
						<Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(16, 1fr)', gap: 0.5, mt: 1.5, width: PAGE_COLUMNS * CELL + (PAGE_COLUMNS - 1) * GAP }}>
							{view.pages.map((slots, i) => {
								const filled = slots.some(Boolean)
								const count = pageMatches[i]
								return (
									<Tooltip key={i} title={`Page ${i + 1}${view.stale.has(i) ? ', out of date' : ''}${count ? `, ${count} match${count > 1 ? 'es' : ''}` : ''}`}>
										<ButtonBase
											onClick={() => setPage(i)}
											sx={{
												position: 'relative',
												height: 24,
												borderRadius: 0.75,
												fontSize: 11,
												fontWeight: 700,
												border: 1,
												borderColor: i === page ? 'primary.main' : 'divider',
												bgcolor: i === page ? 'action.selected' : filled ? 'rgba(255,255,255,0.06)' : 'transparent',
												color: count ? 'primary.main' : filled ? 'text.primary' : 'text.disabled',
												opacity: view.stale.has(i) ? 0.5 : searching && !count ? 0.45 : 1,
												fontStyle: view.stale.has(i) ? 'italic' : 'normal'
											}}
										>
											{i + 1}
											{count > 0 && (
												<Box
													component="span"
													sx={{ position: 'absolute', top: -6, right: -5, minWidth: 14, height: 14, px: 0.4, borderRadius: 7, bgcolor: 'primary.main', color: 'primary.contrastText', fontSize: 9, lineHeight: '14px', fontStyle: 'normal', zIndex: 1 }}
												>
													{count}
												</Box>
											)}
										</ButtonBase>
									</Tooltip>
								)
							})}
						</Box>
					</Box>

					<Paper variant="outlined" sx={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
						<Box sx={{ px: 1.5, py: 1, borderBottom: 1, borderColor: 'divider' }}>
							<Typography variant="subtitle2">
								{searching ? `${matches.length} Match${matches.length === 1 ? '' : 'es'}` : `All Synced Pals (${matches.length})`}
							</Typography>
						</Box>
						<LazyScroll>
							{matches.map((p) => (
								<LazyItem key={p.key} estimate={52}>
									<ResultRow pal={p} onJump={jump} />
								</LazyItem>
							))}
							{!matches.length && (
								<Typography variant="body2" color="text.secondary" sx={{ p: 3, textAlign: 'center' }}>
									No pal matches.
								</Typography>
							)}
						</LazyScroll>
						<RecentlyRemoved />
					</Paper>
				</Box>
			)}

			<Dialog open={confirmRemove} onClose={() => setConfirmRemove(false)}>
				<DialogTitle>Remove All</DialogTitle>
				<DialogContent>
					<DialogContentText>
						This will remove all {synced.length} synced pals from My Pals. They can be added back with Add All to My Pals once their Palbox pages are open in the game.
					</DialogContentText>
				</DialogContent>
				<DialogActions>
					<Button onClick={() => setConfirmRemove(false)}>Cancel</Button>
					<Button
						color="error"
						variant="contained"
						onClick={() => {
							removeOwnedMany(synced.map((o) => o.uid))
							setConfirmRemove(false)
						}}
					>
						Remove {synced.length}
					</Button>
				</DialogActions>
			</Dialog>
		</Paper>
	)
}
