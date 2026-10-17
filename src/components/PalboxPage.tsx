import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import {
	Badge,
	Box,
	Button,
	ButtonBase,
	Chip,
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
import StarIcon from '@mui/icons-material/Star'
import StarBorderIcon from '@mui/icons-material/StarBorder'
import GridIcon from '@mui/icons-material/GridView'
import ListIcon from '@mui/icons-material/ViewList'
import HpIcon from '@mui/icons-material/Favorite'
import AttackIcon from '@mui/icons-material/FlashOn'
import DefenseIcon from '@mui/icons-material/Shield'
import { getPal, getPassive, WORK_KINDS, type Gender, type WorkKind } from '../data/gamedata'
import { combatStats, palElements } from '../data/expeditions'
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
import { rarityColor } from '../theme'
import { GenderIcon, PalAvatar, PassiveList, passiveColor, WORK_INFO, WorkIcon } from './bits'
import { PassivePicker } from './pickers'
import { LazyItem, LazyScroll } from './lazy'

const asset = (file: string) => `${import.meta.env.BASE_URL}${file}`
const ELEMENTS = ['Neutral', 'Fire', 'Water', 'Grass', 'Electric', 'Ice', 'Ground', 'Dark', 'Dragon']
const CELL = 74
const GAP = 6
const lucky = (p: BoxPal) => p.passives.includes('Lucky')
const displayName = (p: BoxPal) => p.name ?? getPal(p.palId).name

function where(p: BoxPal): string {
	if (!p.where) return 'Spot not known'
	return p.live ? describeLocation(p.where) : `Last Seen: ${describeLocation(p.where)}`
}

/** One party or Palbox slot; click to see it in the panel beside the box */
const Slot = memo(function Slot({
	pal,
	dim,
	flash,
	selected,
	onSelect
}: {
	pal: BoxPal | null
	dim: boolean
	flash: boolean
	selected: boolean
	onSelect: (pal: BoxPal) => void
}) {
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
	const lit = flash || selected
	return (
		<Tooltip title={`${displayName(pal)}${pal.level != null ? `, Lv ${pal.level}` : ''}`} placement="top" enterDelay={500}>
			<ButtonBase
				onClick={() => onSelect(pal)}
				sx={{
					...base,
					opacity: dim ? 0.22 : 1,
					// Seen this session but not in My Pals yet
					borderStyle: pal.added ? 'solid' : 'dashed',
					borderColor: lit ? 'primary.main' : pal.alpha ? '#f07a7a' : lucky(pal) ? '#f0c35c' : pal.added ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.35)',
					bgcolor: selected ? 'rgba(92,200,240,0.1)' : base.bgcolor,
					boxShadow: flash ? (t) => `0 0 0 2px ${t.palette.primary.main}, 0 0 18px ${t.palette.primary.main}` : selected ? (t) => `0 0 0 1px ${t.palette.primary.main}` : 'none'
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
			</ButtonBase>
		</Tooltip>
	)
})

// ---- The selected pal, laid out like the game's pal summary ----

const ivColor = (iv: number) => (iv >= 90 ? '#f0c35c' : iv >= 70 ? '#6fcf8a' : iv >= 40 ? '#5cc8f0' : '#8a93a6')

function StatRow({ icon, label, value, iv, soul }: { icon: React.ReactNode; label: string; value?: number; iv?: number; soul?: number }) {
	return (
		<Box sx={{ py: 0.75, borderBottom: 1, borderColor: 'divider' }}>
			<Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
				{icon}
				<Typography variant="body2" sx={{ flex: 1 }}>
					{label}
					{!!soul && (
						<Tooltip title={`Pal Soul rank ${soul}: +${soul * 3}%`}>
							<Box component="span" sx={{ ml: 0.75, fontSize: 12, fontWeight: 700, color: '#b58cf0' }}>
								+{soul}
							</Box>
						</Tooltip>
					)}
				</Typography>
				<Typography variant="body1" fontWeight={700} sx={{ fontVariantNumeric: 'tabular-nums' }}>
					{value != null ? Math.round(value).toLocaleString() : '?'}
				</Typography>
			</Box>
			{iv != null && (
				<Tooltip title="IV (individual value), out of 100; shown in game with Ability Glasses" placement="left">
					<Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
						<Typography variant="caption" color="text.secondary" sx={{ width: 22 }}>
							IV
						</Typography>
						<Box sx={{ flex: 1, height: 6, borderRadius: 3, bgcolor: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
							<Box sx={{ width: `${Math.min(100, iv)}%`, height: '100%', bgcolor: ivColor(iv) }} />
						</Box>
						<Typography variant="caption" fontWeight={700} sx={{ width: 26, textAlign: 'right', color: ivColor(iv), fontVariantNumeric: 'tabular-nums' }}>
							{iv}
						</Typography>
					</Box>
				</Tooltip>
			)}
		</Box>
	)
}

function PalDetail({ pal }: { pal: BoxPal | null }) {
	if (!pal) {
		return (
			<Typography variant="body2" color="text.secondary" sx={{ p: 3, textAlign: 'center' }}>
				Pick a pal to see its details.
			</Typography>
		)
	}
	const info = getPal(pal.palId)
	const color = rarityColor(info.rarity)
	const s = pal.stats
	const combat = s ? combatStats(pal.palId, s) : null
	const work = WORK_KINDS.filter((w) => info.work[w] > 0)
	return (
		<Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
			<Box sx={{ display: 'flex', alignItems: 'stretch', gap: 1.5 }}>
				<Box sx={{ px: 1.5, py: 0.5, borderLeft: 3, borderColor: 'primary.main', bgcolor: 'rgba(255,255,255,0.04)', textAlign: 'center', minWidth: 72 }}>
					<Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1.6 }}>
						Level
					</Typography>
					<Typography sx={{ fontSize: 34, fontWeight: 800, lineHeight: 1 }}>{pal.level ?? '?'}</Typography>
				</Box>
				<Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
					<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
						<Typography variant="h6" noWrap sx={{ lineHeight: 1.2 }}>
							{displayName(pal)}
						</Typography>
						<GenderIcon gender={pal.gender} size={20} />
					</Box>
					{pal.name && (
						<Typography variant="body2" color="text.secondary" noWrap>
							{info.name}
						</Typography>
					)}
					<Box sx={{ display: 'flex', gap: 0.5, mt: 0.5, flexWrap: 'wrap' }}>
						{pal.alpha && <Chip size="small" icon={<CrownIcon />} label="Alpha" sx={{ color: '#f07a7a', '& .MuiChip-icon': { color: '#f07a7a' } }} variant="outlined" />}
						{lucky(pal) && <Chip size="small" icon={<CloverIcon />} label="Lucky" sx={{ color: '#f0c35c', '& .MuiChip-icon': { color: '#f0c35c' } }} variant="outlined" />}
					</Box>
				</Box>
			</Box>

			<Box sx={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: 2, alignItems: 'start' }}>
				<Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
					<Tooltip title={`Condensed ${s?.stars ?? 0} of 4 times`}>
						<Box sx={{ display: 'flex', color: '#f0c35c' }}>
							{[0, 1, 2, 3].map((i) => (i < (s?.stars ?? 0) ? <StarIcon key={i} sx={{ fontSize: 20 }} /> : <StarBorderIcon key={i} sx={{ fontSize: 20, opacity: 0.4 }} />))}
						</Box>
					</Tooltip>
					<Box sx={{ width: 132, height: 132, borderRadius: '50%', border: `3px solid ${color}`, background: `radial-gradient(circle, ${color}33, transparent 70%)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
						<img src={asset(`pals/${pal.palId}.png`)} alt="" width={112} height={112} style={{ objectFit: 'contain' }} />
					</Box>
					<Box sx={{ display: 'flex', gap: 0.5 }}>
						{palElements(pal.palId).map((el) => (
							<Tooltip key={el} title={el}>
								<img src={asset(`elements/${el}.webp`)} alt={el} width={24} height={24} />
							</Tooltip>
						))}
					</Box>
				</Box>
				<Box>
					<StatRow icon={<HpIcon sx={{ fontSize: 18, color: '#6fcf8a' }} />} label="HP" value={combat?.hp} iv={s?.ivs[0]} soul={s?.souls[0]} />
					<StatRow icon={<AttackIcon sx={{ fontSize: 18, color: '#f08a5c' }} />} label="Attack" value={combat?.attack} iv={s?.ivs[1]} soul={s?.souls[1]} />
					<StatRow icon={<DefenseIcon sx={{ fontSize: 18, color: '#5cc8f0' }} />} label="Defense" value={combat?.defense} iv={s?.ivs[2]} soul={s?.souls[2]} />
					{!s && (
						<Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 1 }}>
							Stats come through once the game link reads this pal.
						</Typography>
					)}
				</Box>
			</Box>

			<Box>
				<Typography variant="overline" color="text.secondary">
					Work Suitability
				</Typography>
				<Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
					{WORK_KINDS.map((w) => {
						const level = info.work[w]
						return (
							<Tooltip key={w} title={level ? `${WORK_INFO[w].label} Lv ${level}` : WORK_INFO[w].label}>
								<Box sx={{ position: 'relative', p: 0.5, borderRadius: 1, bgcolor: level ? 'rgba(255,255,255,0.06)' : 'transparent', opacity: level ? 1 : 0.2 }}>
									<WorkIcon kind={w} size={24} />
									{level > 0 && (
										<Box sx={{ position: 'absolute', right: 0, bottom: -2, fontSize: 11, fontWeight: 800, textShadow: '0 1px 2px #000' }}>{level}</Box>
									)}
								</Box>
							</Tooltip>
						)
					})}
				</Box>
				{!work.length && (
					<Typography variant="caption" color="text.secondary">
						Doesn't work at bases.
					</Typography>
				)}
			</Box>

			<Box>
				<Typography variant="overline" color="text.secondary">
					Passive Skills
				</Typography>
				{pal.passives.length ? (
					pal.passives.map((name) => {
						const p = getPassive(name)
						return (
							<Box key={name} sx={{ py: 0.75, pl: 1.25, mb: 0.75, borderLeft: 3, borderColor: passiveColor(p?.rank ?? 0), bgcolor: 'rgba(255,255,255,0.03)' }}>
								<Typography variant="body2" fontWeight={700} sx={{ color: passiveColor(p?.rank ?? 0) }}>
									{name}
								</Typography>
								{p?.description && (
									<Typography variant="caption" color="text.secondary">
										{p.description}
									</Typography>
								)}
							</Box>
						)
					})
				) : (
					<Typography variant="body2" color="text.secondary">
						None
					</Typography>
				)}
			</Box>

			<Typography variant="caption" color={pal.live ? 'text.secondary' : 'warning.main'}>
				{where(pal)}
				{!pal.added && '. Not in My Pals yet.'}
			</Typography>
		</Box>
	)
}

// ---- Search ----

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

/** A pal in the List view; clicking it shows it in the grid */
const ResultRow = memo(function ResultRow({ pal, onJump }: { pal: BoxPal; onJump: (pal: BoxPal) => void }) {
	const jumpable = pal.where?.box === 'party' || pal.where?.box === 'palbox'
	return (
		<ButtonBase
			disabled={!jumpable}
			onClick={() => onJump(pal)}
			sx={{ display: 'flex', width: '100%', justifyContent: 'flex-start', textAlign: 'left', gap: 1.25, px: 1.5, py: 0.75, borderBottom: 1, borderColor: 'divider', '&:hover': { bgcolor: 'action.hover' } }}
		>
			<PalAvatar palId={pal.palId} size={34} />
			<Box sx={{ width: 260, minWidth: 0 }}>
				<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
					<Typography variant="body2" fontWeight={600} noWrap>
						{displayName(pal)}
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
			{pal.stats && (
				<Typography variant="caption" color="text.secondary" sx={{ width: 150, fontVariantNumeric: 'tabular-nums' }}>
					IVs {pal.stats.ivs.join(' / ')}
				</Typography>
			)}
			<Box sx={{ flex: 1, minWidth: 0 }}>
				<PassiveList passives={pal.passives} />
			</Box>
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

// ---- Page ----

type View = 'grid' | 'list'

export function PalboxPage() {
	const owned = useStoreSelect((s) => s.owned)
	const { addFromGame, removeOwnedMany } = useActions()
	const gamePals = useGamePals()
	const [view, setView] = useState<View>('grid')
	const [page, setPage] = useState(0)
	const [filter, setFilter] = useState<BoxFilter>(emptyFilter)
	const [selectedKey, setSelectedKey] = useState<string | null>(null)
	const [flash, setFlash] = useState<string | null>(null)
	const [confirmRemove, setConfirmRemove] = useState(false)
	const flashTimer = useRef<ReturnType<typeof setTimeout>>()
	useEffect(() => () => clearTimeout(flashTimer.current), [])

	const addPlan = useMemo(() => planAdd(owned, gamePals), [owned, gamePals])
	const box = useMemo(() => buildBox(owned, gamePals, addPlan.linked), [owned, gamePals, addPlan])
	const pending = addPlan.links.size + addPlan.adds.length
	const synced = useMemo(() => owned.filter((o) => o.game), [owned])
	// Until one is picked (or if the picked one is gone), the first pal in the party or box
	const selected = useMemo(() => box.all.find((p) => p.key === selectedKey) ?? box.all.find((p) => p.where?.box !== 'other') ?? null, [box, selectedKey])

	// Matching keeps up with typing; the grid and list catch up a beat later when it falls behind
	const deferred = useDeferredValue(filter)
	const searching = filterActive(deferred)
	const matches = useMemo(() => (searching ? box.all.filter((p) => matchesFilter(p, deferred)) : box.all), [box, deferred, searching])
	const matchKeys = useMemo(() => (searching ? new Set(matches.map((p) => p.key)) : null), [matches, searching])
	const pageMatches = useMemo(() => {
		const counts = Array(PAGE_COUNT).fill(0)
		if (matchKeys) for (const p of matches) if (p.where?.box === 'palbox') counts[pageOf(p.where.slot)]++
		return counts
	}, [matches, matchKeys])
	const partyMatches = matchKeys ? box.party.filter((p) => p && matchKeys.has(p.key)).length : 0

	const select = useCallback((pal: BoxPal) => setSelectedKey(pal.key), [])
	// From the List view: open the grid on its page, pick it and make it glow for a moment
	const jump = useCallback((pal: BoxPal) => {
		if (pal.where?.box === 'palbox') setPage(pageOf(pal.where.slot))
		setView('grid')
		setSelectedKey(pal.key)
		setFlash(pal.key)
		clearTimeout(flashTimer.current)
		flashTimer.current = setTimeout(() => setFlash(null), 1800)
	}, [])

	const dimOf = (p: BoxPal | null) => !!p && !!matchKeys && !matchKeys.has(p.key)
	const slot = (p: BoxPal | null, i: number) => <Slot key={i} pal={p} dim={dimOf(p)} flash={!!p && p.key === flash} selected={!!p && p.key === selected?.key} onSelect={select} />
	const stale = box.stale.has(page)

	return (
		<Paper variant="outlined" sx={{ height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
			<Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 1.5, borderBottom: 1, borderColor: 'divider' }}>
				<ToggleButtonGroup size="small" exclusive value={view} onChange={(_, v: View | null) => v && setView(v)}>
					<ToggleButton value="grid" sx={{ gap: 0.5 }}>
						<GridIcon fontSize="small" />
						Grid
					</ToggleButton>
					<ToggleButton value="list" sx={{ gap: 0.5 }}>
						<ListIcon fontSize="small" />
						List
					</ToggleButton>
				</ToggleButtonGroup>
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

			{!box.all.length ? (
				<Typography variant="body2" color="text.secondary" sx={{ p: 4, textAlign: 'center' }}>
					Your Palbox shows up here once the game link is connected. Open your Palbox pages in the game to sync them.
				</Typography>
			) : view === 'list' ? (
				<Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
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
				</Box>
			) : (
				<Box sx={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: 'auto auto minmax(360px, 504px)', justifyContent: 'center', gap: 3, p: 2 }}>
					<Box>
						<Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, height: 34, mb: 1 }}>
							<Typography variant="subtitle2">Party</Typography>
							{partyMatches > 0 && <Badge color="primary" badgeContent={partyMatches} sx={{ ml: 1.5 }} />}
						</Box>
						<Box sx={{ display: 'flex', flexDirection: 'column', gap: `${GAP}px` }}>{Array.from({ length: PARTY_SLOTS }, (_, i) => slot(box.party[i], i))}</Box>
					</Box>

					<Box>
						<Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5, height: 34, mb: 1 }}>
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
								{box.pages[page].map(slot)}
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
							{box.pages.map((slots, i) => {
								const filled = slots.some(Boolean)
								const count = pageMatches[i]
								return (
									<Tooltip key={i} title={`Page ${i + 1}${box.stale.has(i) ? ', out of date' : ''}${count ? `, ${count} match${count > 1 ? 'es' : ''}` : ''}`}>
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
												opacity: box.stale.has(i) ? 0.5 : searching && !count ? 0.45 : 1,
												fontStyle: box.stale.has(i) ? 'italic' : 'normal'
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

					<Paper variant="outlined" sx={{ minHeight: 0, overflowY: 'auto' }}>
						<PalDetail pal={selected} />
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
