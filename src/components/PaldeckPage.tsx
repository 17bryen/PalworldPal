import { memo, startTransition, useCallback, useEffect, useMemo, useState } from 'react'
import {
	Box,
	Checkbox,
	Chip,
	LinearProgress,
	FormControlLabel,
	InputAdornment,
	Link,
	ListItemIcon,
	ListSubheader,
	Menu,
	MenuItem,
	Paper,
	Table,
	TableBody,
	TableCell,
	TableContainer,
	TableHead,
	TableRow,
	TableSortLabel,
	TextField,
	ToggleButton,
	ToggleButtonGroup,
	Tooltip,
	Typography
} from '@mui/material'
import SearchIcon from '@mui/icons-material/Search'
import StarIcon from '@mui/icons-material/Star'
import StarBorderIcon from '@mui/icons-material/StarBorder'
import CheckIcon from '@mui/icons-material/Check'
import EggIcon from '@mui/icons-material/EggOutlined'
import MapIcon from '@mui/icons-material/MapOutlined'
import GridIcon from '@mui/icons-material/GridView'
import ListIcon from '@mui/icons-material/ViewList'
import { pals, WORK_KINDS, type PalInfo, type WorkKind } from '../data/gamedata'
import { palElements } from '../data/expeditions'
import { legendaryLine } from '../data/lineage'
import { OTHER_REGION, REGIONS, regionName, spawnRegions } from '../data/regions'
import { useActions, useStoreSelect } from '../state/store'
import { useNavigation } from '../state/nav'
import { useBridge } from '../state/bridge'
import { palHabitat } from '../data/map'
import { CATCH_TARGET } from '../data/paldeck'
import { rarityColor } from '../theme'
import { WORK_INFO, WorkIcon } from './bits'

const asset = (file: string) => `${import.meta.env.BASE_URL}${file}`
const ELEMENTS = ['Neutral', 'Fire', 'Water', 'Grass', 'Electric', 'Ice', 'Ground', 'Dark', 'Dragon']
const VIEW_KEY = 'palbreeder.paldeckView'

type View = 'grid' | 'list'
type SortKey = 'dex' | 'name' | WorkKind
type BreedFilter = 'any' | 'legendaryLine'
type LegendFilter = 'any' | 'only' | 'none'
type AccessFilter = 'any' | 'reachable' | 'unreachable'
type CaughtFilter = 'any' | 'need' | 'done'

/** Short region names for the table; the full list is in the hover text */
const SHORT: Record<string, string> = {
	windswept: 'Windswept',
	verdant: 'Verdant',
	sanctuary1: 'Sanctuary 1',
	obsidian: 'Obsidian',
	desert: 'Desert',
	astral: 'Astral',
	sanctuary2: 'Sanctuary 2',
	sakurajima: 'Sakurajima',
	sanctuary3: 'Sanctuary 3',
	feybreak: 'Feybreak',
	sunreach: 'Sunreach',
	worldTree: 'World Tree',
	other: 'Other'
}

function initialView(): View {
	try {
		return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'grid'
	} catch {
		return 'grid'
	}
}

/** Opens the pal's menu: Target Pals, breeding combinations, the map */
type OpenMenu = (palId: string, x: number, y: number) => void

function Elements({ palId, size }: { palId: string; size: number }) {
	return (
		<>
			{palElements(palId).map((el) => (
				<img key={el} src={asset(`elements/${el}.webp`)} alt={el} title={el} width={size} height={size} style={{ display: 'block' }} />
			))}
		</>
	)
}

/** Where it lives; links to its habitat on the map */
function FoundIn({ palId, onShowOnMap }: { palId: string; onShowOnMap: (id: string) => void }) {
	const regions = spawnRegions(palId)
	if (!regions.length)
		return (
			<Typography variant="caption" color="text.disabled">
				Not wild
			</Typography>
		)
	const text = regions.map((r) => SHORT[r] ?? r).join(', ')
	if (!palHabitat[palId]?.length) return <Typography variant="caption">{text}</Typography>
	return (
		<Link component="button" variant="caption" underline="hover" title={`Show on the map: ${regions.map(regionName).join(', ')}`} onClick={() => onShowOnMap(palId)} sx={{ textAlign: 'left' }}>
			{text}
		</Link>
	)
}

/** Catch counter: minus, count (click to mark complete or clear), plus; plain buttons, styled by the table */
function CatchStepper({ palId, count, onSet }: { palId: string; count: number; onSet: (id: string, n: number) => void }) {
	const done = count >= CATCH_TARGET
	return (
		<div className="stepper">
			<button disabled={count === 0} title="One fewer" onClick={() => onSet(palId, count - 1)}>
				-
			</button>
			<button className={`count${done ? ' done' : count ? '' : ' none'}`} title={done ? 'Clear catches' : 'Mark all caught'} onClick={() => onSet(palId, done ? 0 : CATCH_TARGET)}>
				{done ? <CheckIcon sx={{ fontSize: 16, verticalAlign: 'middle' }} /> : `${count}/${CATCH_TARGET}`}
			</button>
			<button disabled={done} title="Caught one" onClick={() => onSet(palId, count + 1)}>
				+
			</button>
		</div>
	)
}

/** A portrait in a ring of its rarity color */
const Portrait = ({ pal, size }: { pal: PalInfo; size: number }) => (
	<img className="portrait" src={asset(`pals/${pal.id}.png`)} alt="" width={size} height={size} loading="lazy" style={{ borderColor: `${rarityColor(pal.rarity)}99`, background: `${rarityColor(pal.rarity)}1f` }} />
)

// ---- List ----

// About 300 rows of 16 cells: plain table cells styled once by the table keep rendering and switching quick
const PalRow = memo(function PalRow({
	pal,
	wanted,
	caught,
	onSetCatches,
	onShowOnMap,
	onMenu
}: {
	pal: PalInfo
	wanted: boolean
	caught: number
	onSetCatches: (id: string, n: number) => void
	onShowOnMap: (id: string) => void
	onMenu: OpenMenu
}) {
	return (
		<tr
			onContextMenu={(e) => {
				e.preventDefault()
				onMenu(pal.id, e.clientX, e.clientY)
			}}
		>
			<td>
				<div className="pal">
					<Portrait pal={pal} size={28} />
					<div className="name">
						<div className={pal.legendary ? 'legendary' : undefined}>
							{pal.name}
							{wanted && <StarIcon titleAccess="In Target Pals" sx={{ fontSize: 14, color: rarityColor(20), ml: 0.5, verticalAlign: '-2px' }} />}
						</div>
						<span className="sub">
							#{pal.dex}
							{legendaryLine.has(pal.id) && (
								<span className="legendary" title="Can only be bred from itself or legendary pals">
									{' '}
									Self-Bred
								</span>
							)}
						</span>
					</div>
				</div>
			</td>
			<td>
				<div className="types">
					<Elements palId={pal.id} size={20} />
				</div>
			</td>
			<td>
				<CatchStepper palId={pal.id} count={caught} onSet={onSetCatches} />
			</td>
			{WORK_KINDS.map((kind, i) => {
				const level = pal.work[kind]
				return (
					<td key={kind} className={`work${i === 0 ? ' first' : ''}${i === WORK_KINDS.length - 1 ? ' last' : ''}`} style={level ? { color: WORK_INFO[kind].color, opacity: 0.45 + level * 0.11 } : undefined}>
						{level > 0 && level}
					</td>
				)
			})}
			<td>
				<FoundIn palId={pal.id} onShowOnMap={onShowOnMap} />
			</td>
		</tr>
	)
})

/** Shared look for the list's rows; one stylesheet instead of styles on every cell */
const listSx = {
	flex: 1,
	minHeight: 0,
	'& table': { borderCollapse: 'separate', borderSpacing: 0, width: '100%' },
	'& th': { px: 3 },
	'& th.work': { px: 0.5 },
	'& th.work.first, & td.work.first': { pl: 3 },
	'& th.work.last, & td.work.last': { pr: 3 },
	'& td': { px: 3, py: 0.75, borderBottom: '1px solid', borderColor: 'divider', fontSize: 14, verticalAlign: 'middle' },
	'& td.work': { px: 0.5, textAlign: 'center', fontWeight: 700 },
	'& tbody tr:hover': { bgcolor: 'action.hover' },
	'& .pal': { display: 'flex', alignItems: 'center', gap: 1.25, minWidth: 0 },
	'& .name': { minWidth: 0, fontWeight: 600, whiteSpace: 'nowrap' },
	'& .sub': { fontSize: 12, fontWeight: 400, color: 'text.secondary' },
	'& .legendary': { color: rarityColor(20) },
	'& .portrait': { borderRadius: '50%', border: '1.5px solid', flexShrink: 0, display: 'block' },
	'& .types': { display: 'flex', gap: 0.5 },
	'& .stepper': { display: 'flex', alignItems: 'center' },
	'& .stepper button': { all: 'unset', cursor: 'pointer', height: 24, minWidth: 22, textAlign: 'center', borderRadius: 12, fontSize: 15, fontWeight: 700, color: 'text.secondary' },
	'& .stepper button:hover:not(:disabled)': { bgcolor: 'action.hover' },
	'& .stepper button:disabled': { cursor: 'default', opacity: 0.3 },
	'& .stepper .count': { minWidth: 40, fontSize: 13, color: 'text.primary', fontVariantNumeric: 'tabular-nums' },
	'& .stepper .count.none': { color: 'text.disabled' },
	'& .stepper .count.done': { color: 'success.main', bgcolor: 'rgba(111,207,138,0.12)' }
} as const

// ---- Grid ----

const PalCard = memo(function PalCard({ pal, wanted, caught, onMenu }: { pal: PalInfo; wanted: boolean; caught: number; onMenu: OpenMenu }) {
	const color = rarityColor(pal.rarity)
	const done = caught >= CATCH_TARGET
	const open = (e: React.MouseEvent) => {
		e.preventDefault()
		onMenu(pal.id, e.clientX, e.clientY)
	}
	return (
		<div className="card" onClick={open} onContextMenu={open} style={{ ['--rarity' as string]: color }}>
			<div className="art">
				<img src={asset(`pals/${pal.id}.png`)} alt="" width={88} height={88} loading="lazy" />
				<div className="left">
					<span className="dex">{pal.dex}</span>
					<Elements palId={pal.id} size={18} />
				</div>
				<div className="right">
					{wanted && <StarIcon titleAccess="In Target Pals" sx={{ fontSize: 16, color: rarityColor(20) }} />}
					<span className={`caught${done ? ' done' : caught ? '' : ' none'}`} title={`Caught ${Math.min(caught, CATCH_TARGET)} of ${CATCH_TARGET}`}>
						{done ? <CheckIcon sx={{ fontSize: 13, verticalAlign: 'middle' }} /> : `${caught}/${CATCH_TARGET}`}
					</span>
				</div>
			</div>
			<div className="info">
				<div className={`title${pal.legendary ? ' legendary' : ''}`}>{pal.name}</div>
				<div className="stats">
					<span className="stat hp">
						<b>HP</b>
						{pal.stats.hp}
					</span>
					<span className="stat atk">
						<b>ATK</b>
						{pal.stats.attack}
					</span>
					<span className="stat def">
						<b>DEF</b>
						{pal.stats.defense}
					</span>
				</div>
				<div className="works">
					{WORK_KINDS.filter((k) => pal.work[k] > 0).map((k) => (
						<span key={k} title={`${WORK_INFO[k].label} Lv ${pal.work[k]}`}>
							<WorkIcon kind={k} size={18} />
							{pal.work[k]}
						</span>
					))}
				</div>
			</div>
		</div>
	)
})

/** Shared look for the cards */
const gridSx = {
	flex: 1,
	minHeight: 0,
	overflowY: 'auto',
	p: 1.5,
	'& .cards': { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 1.25 },
	'& .card': {
		position: 'relative',
		borderRadius: 2,
		border: '1px solid',
		borderColor: 'divider',
		overflow: 'hidden',
		cursor: 'pointer',
		bgcolor: 'rgba(255,255,255,0.03)',
		transition: 'border-color 120ms, transform 120ms'
	},
	'& .card:hover': { borderColor: 'var(--rarity)', transform: 'translateY(-1px)' },
	'& .art': {
		position: 'relative',
		height: 96,
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'center',
		background: 'radial-gradient(circle at 50% 60%, color-mix(in srgb, var(--rarity) 22%, transparent), transparent 68%)'
	},
	'& .art > img': { objectFit: 'contain' },
	'& .left': { position: 'absolute', left: 6, top: 4, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 },
	'& .dex': { fontSize: 12, fontWeight: 700, color: 'text.secondary', lineHeight: 1.2 },
	'& .right': { position: 'absolute', right: 6, top: 5, display: 'flex', alignItems: 'center', gap: 0.5 },
	'& .caught': { px: 0.6, borderRadius: 1, fontSize: 11, fontWeight: 800, lineHeight: '16px', bgcolor: 'rgba(0,0,0,0.35)' },
	'& .caught.none': { color: 'text.disabled' },
	'& .caught.done': { color: 'success.main', bgcolor: 'rgba(111,207,138,0.14)' },
	'& .info': { px: 1, pb: 1, pt: 0.5 },
	'& .title': { fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
	'& .title.legendary': { color: rarityColor(20) },
	'& .stats': { display: 'flex', gap: 0.5, mt: 0.5 },
	'& .stat': { display: 'flex', borderRadius: 0.75, overflow: 'hidden', fontSize: 10, fontWeight: 800, lineHeight: '16px', bgcolor: 'rgba(255,255,255,0.08)', pr: 0.5 },
	'& .stat b': { px: 0.5, mr: 0.5, color: '#0e1014' },
	'& .stat.hp b': { bgcolor: '#6fcf8a' },
	'& .stat.atk b': { bgcolor: '#f08a5c' },
	'& .stat.def b': { bgcolor: '#5cc8f0' },
	'& .works': { display: 'flex', flexWrap: 'wrap', gap: 0.75, mt: 0.75, minHeight: 20 },
	'& .works span': { display: 'flex', alignItems: 'center', gap: 0.25, fontSize: 12, fontWeight: 800 }
} as const

// ---- Right-click menu ----

function PalMenu({ menu, onClose }: { menu: { palId: string; x: number; y: number } | null; onClose: () => void }) {
	const isWanted = useStoreSelect((s) => !!menu && s.wanted.some((w) => w.palId === menu.palId))
	const { addWantedMany, removeWantedPal } = useActions()
	const { openPalCombos, openPalOnMap } = useNavigation()
	const pal = menu ? pals.find((p) => p.id === menu.palId) : undefined
	const run = (fn: () => void) => () => {
		fn()
		onClose()
	}
	return (
		<Menu
			open={!!menu}
			onClose={onClose}
			anchorReference="anchorPosition"
			anchorPosition={menu ? { top: menu.y, left: menu.x } : undefined}
			slotProps={{ list: { dense: true } }}
		>
			{pal && <ListSubheader sx={{ lineHeight: '32px', bgcolor: 'transparent' }}>{pal.name}</ListSubheader>}
			{pal && (
				<MenuItem onClick={run(() => (isWanted ? removeWantedPal(pal.id) : addWantedMany([pal.id])))}>
					<ListItemIcon>{isWanted ? <StarIcon fontSize="small" sx={{ color: rarityColor(20) }} /> : <StarBorderIcon fontSize="small" />}</ListItemIcon>
					{isWanted ? 'Remove From Target Pals' : 'Add to Target Pals'}
				</MenuItem>
			)}
			{pal && (
				<MenuItem onClick={run(() => openPalCombos(pal.id))}>
					<ListItemIcon>
						<EggIcon fontSize="small" />
					</ListItemIcon>
					Show Breeding Combinations
				</MenuItem>
			)}
			{pal && palHabitat[pal.id]?.length > 0 && (
				<MenuItem onClick={run(() => openPalOnMap(pal.id))}>
					<ListItemIcon>
						<MapIcon fontSize="small" />
					</ListItemIcon>
					Show on Map
				</MenuItem>
			)}
		</Menu>
	)
}

// ---- Page ----

export function PaldeckPage() {
	const wanted = useStoreSelect((s) => s.wanted)
	const disabledRegions = useStoreSelect((s) => s.settings.disabledRegions)
	const catches = useStoreSelect((s) => s.catches)
	const syncCatches = useStoreSelect((s) => s.syncCatches)
	const { setCatches } = useActions()
	const { openPalOnMap } = useNavigation()
	const { captures } = useBridge()
	const [view, setView] = useState<View>(initialView)
	// Views mount the first time they're shown and then stay, hidden, so switching back is instant
	const [opened, setOpened] = useState<Set<View>>(() => new Set([view]))
	const [search, setSearch] = useState('')
	const [element, setElement] = useState('any')
	const [work, setWork] = useState<WorkKind | 'any'>('any')
	const [minLevel, setMinLevel] = useState(1)
	const [region, setRegion] = useState('any')
	const [onlyThere, setOnlyThere] = useState(false)
	const [access, setAccess] = useState<AccessFilter>('any')
	const [caughtFilter, setCaughtFilter] = useState<CaughtFilter>('any')
	const [breed, setBreed] = useState<BreedFilter>('any')
	const [legend, setLegend] = useState<LegendFilter>('any')
	const [sortKey, setSortKey] = useState<SortKey>('dex')
	const [sortDesc, setSortDesc] = useState(false)
	const [menu, setMenu] = useState<{ palId: string; x: number; y: number } | null>(null)

	// The first rows show at once; the rest render in the background so opening the page never stalls
	const [rowLimit, setRowLimit] = useState(50)
	useEffect(() => startTransition(() => setRowLimit(Infinity)), [])

	const wantedIds = useMemo(() => new Set(wanted.map((w) => w.palId)), [wanted])

	const rows = useMemo(() => {
		const q = search.trim().toLowerCase()
		const list = pals.filter((p) => {
			const regions = spawnRegions(p.id)
			const reachable = regions.some((r) => !disabledRegions.includes(r))
			return (
				(!q || p.name.toLowerCase().includes(q)) &&
				(element === 'any' || palElements(p.id).includes(element)) &&
				(work === 'any' || p.work[work] >= minLevel) &&
				(region === 'any' || (onlyThere ? regions.length === 1 && regions[0] === region : regions.includes(region))) &&
				(access === 'any' || (access === 'reachable' ? reachable : !reachable)) &&
				(caughtFilter === 'any' || ((catches[p.id] ?? 0) >= CATCH_TARGET) === (caughtFilter === 'done')) &&
				(breed === 'any' || legendaryLine.has(p.id)) &&
				(legend === 'any' || (legend === 'only' ? p.legendary : !p.legendary))
			)
		})
		const value = (p: PalInfo): number | string => (sortKey === 'dex' ? p.dex + (p.variant ? 0.5 : 0) : sortKey === 'name' ? p.name : p.work[sortKey])
		return list.sort((a, b) => {
			const va = value(a)
			const vb = value(b)
			const cmp = typeof va === 'string' ? va.localeCompare(vb as string) : va - (vb as number)
			return (sortDesc ? -cmp : cmp) || a.dex - b.dex
		})
	}, [search, element, work, minLevel, region, onlyThere, access, caughtFilter, catches, disabledRegions, breed, legend, sortKey, sortDesc])

	const completed = useMemo(() => pals.filter((p) => (catches[p.id] ?? 0) >= CATCH_TARGET).length, [catches])
	const fromGame = !!captures && syncCatches

	const chooseView = (v: View) => {
		setView(v)
		if (!opened.has(v)) {
			// Mount the new view with its first rows, then fill in the rest in the background
			setRowLimit(50)
			setOpened((o) => new Set([...o, v]))
			startTransition(() => setRowLimit(Infinity))
		}
		try {
			localStorage.setItem(VIEW_KEY, v)
		} catch {
			// Only a convenience
		}
	}
	const sortBy = (key: SortKey) => {
		if (key === sortKey) setSortDesc(!sortDesc)
		else {
			setSortKey(key)
			// Work levels read best highest first
			setSortDesc(key !== 'dex' && key !== 'name')
		}
	}
	const chooseWork = (kind: WorkKind | 'any') => {
		setWork(kind)
		if (kind !== 'any') {
			setSortKey(kind)
			setSortDesc(true)
		} else if (sortKey !== 'dex' && sortKey !== 'name') {
			setSortKey('dex')
			setSortDesc(false)
		}
	}
	const openMenu = useCallback<OpenMenu>((palId, x, y) => setMenu({ palId, x, y }), [])
	const shown = rows.slice(0, rowLimit)

	return (
		<Paper variant="outlined" sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
			<Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1.5, p: 1.5, borderBottom: 1, borderColor: 'divider' }}>
				<ToggleButtonGroup size="small" exclusive value={view} onChange={(_, v: View | null) => v && chooseView(v)}>
					<ToggleButton value="grid" sx={{ gap: 0.5 }}>
						<GridIcon fontSize="small" />
						Grid
					</ToggleButton>
					<ToggleButton value="list" sx={{ gap: 0.5 }}>
						<ListIcon fontSize="small" />
						List
					</ToggleButton>
				</ToggleButtonGroup>
				<TextField
					size="small"
					placeholder="Search pals"
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					sx={{ width: 170 }}
					slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }}
				/>
				<TextField select size="small" label="Type" value={element} onChange={(e) => setElement(e.target.value)} sx={{ width: 130 }}>
					<MenuItem value="any">Any</MenuItem>
					{ELEMENTS.map((el) => (
						<MenuItem key={el} value={el}>
							<Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
								<img src={asset(`elements/${el}.webp`)} alt="" width={18} height={18} />
								{el}
							</Box>
						</MenuItem>
					))}
				</TextField>
				<TextField select size="small" label="Work" value={work} onChange={(e) => chooseWork(e.target.value as WorkKind | 'any')} sx={{ width: 200 }}>
					<MenuItem value="any">Any</MenuItem>
					{WORK_KINDS.map((kind) => (
						<MenuItem key={kind} value={kind}>
							<Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
								<WorkIcon kind={kind} />
								{WORK_INFO[kind].label}
							</Box>
						</MenuItem>
					))}
				</TextField>
				{work !== 'any' && (
					<TextField select size="small" label="Min Level" value={minLevel} onChange={(e) => setMinLevel(Number(e.target.value))} sx={{ width: 95 }}>
						{[1, 2, 3, 4, 5].map((n) => (
							<MenuItem key={n} value={n}>
								{n}
							</MenuItem>
						))}
					</TextField>
				)}
				<TextField select size="small" label="Region" value={region} onChange={(e) => setRegion(e.target.value)} sx={{ width: 180 }}>
					<MenuItem value="any">Any</MenuItem>
					{[...REGIONS, OTHER_REGION].map((r) => (
						<MenuItem key={r.key} value={r.key}>
							{r.name}
						</MenuItem>
					))}
				</TextField>
				{region !== 'any' && <FormControlLabel control={<Checkbox size="small" checked={onlyThere} onChange={(e) => setOnlyThere(e.target.checked)} />} label="Only There" />}
				<Tooltip title="Based on the regions turned on in Map access" placement="top">
					<TextField select size="small" label="Map Access" value={access} onChange={(e) => setAccess(e.target.value as AccessFilter)} sx={{ width: 140 }}>
						<MenuItem value="any">Any</MenuItem>
						<MenuItem value="reachable">Can Catch</MenuItem>
						<MenuItem value="unreachable">Can't Catch</MenuItem>
					</TextField>
				</Tooltip>
				<TextField select size="small" label="Breeding" value={breed} onChange={(e) => setBreed(e.target.value as BreedFilter)} sx={{ width: 150 }}>
					<MenuItem value="any">Any</MenuItem>
					<MenuItem value="legendaryLine">Self-Bred Only</MenuItem>
				</TextField>
				<TextField select size="small" label="Caught" value={caughtFilter} onChange={(e) => setCaughtFilter(e.target.value as CaughtFilter)} sx={{ width: 120 }}>
					<MenuItem value="any">Any</MenuItem>
					<MenuItem value="need">Still Need</MenuItem>
					<MenuItem value="done">Done</MenuItem>
				</TextField>
				<TextField select size="small" label="Legendary" value={legend} onChange={(e) => setLegend(e.target.value as LegendFilter)} sx={{ width: 115 }}>
					<MenuItem value="any">Any</MenuItem>
					<MenuItem value="only">Only</MenuItem>
					<MenuItem value="none">Hide</MenuItem>
				</TextField>
				{view === 'grid' && (
					<TextField select size="small" label="Sort" value={sortKey} onChange={(e) => sortBy(e.target.value as SortKey)} sx={{ width: 150 }}>
						<MenuItem value="dex">Paldeck Number</MenuItem>
						<MenuItem value="name">Name</MenuItem>
						{work !== 'any' && <MenuItem value={work}>{WORK_INFO[work].label}</MenuItem>}
					</TextField>
				)}
				<Box sx={{ ml: 'auto', width: 240, whiteSpace: 'nowrap' }} title={`${completed} of ${pals.length} pals caught ${CATCH_TARGET} times`}>
					<Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1 }}>
						<Typography variant="caption" fontWeight={700}>
							{completed} / {pals.length} Done
						</Typography>
						{fromGame && (
							<Tooltip title={`Catches come from the game, last read ${new Date(captures!.at).toLocaleTimeString()}. Turn this off in Game link.`}>
								<Chip size="small" color="success" variant="outlined" label="From Game" sx={{ height: 18, fontSize: 11 }} />
							</Tooltip>
						)}
						<Typography variant="caption" color="text.secondary">
							{rows.length} shown
						</Typography>
					</Box>
					<LinearProgress
						variant="determinate"
						value={(completed / pals.length) * 100}
						color="success"
						sx={{ height: 6, borderRadius: 3, mt: 0.25, bgcolor: 'rgba(255,255,255,0.08)', '& .MuiLinearProgress-bar': { borderRadius: 3 } }}
					/>
				</Box>
			</Box>

			{opened.has('grid') && (
				<Box sx={{ ...gridSx, display: view === 'grid' ? 'block' : 'none' }}>
					<div className="cards">
						{shown.map((p) => (
							<PalCard key={p.id} pal={p} wanted={wantedIds.has(p.id)} caught={catches[p.id] ?? 0} onMenu={openMenu} />
						))}
					</div>
				</Box>
			)}
			{opened.has('list') && (
				<TableContainer sx={{ ...listSx, display: view === 'list' ? 'block' : 'none' }}>
					<Table size="small" stickyHeader>
						<TableHead>
							<TableRow>
								<TableCell sx={{ width: 240 }}>
									<TableSortLabel active={sortKey === 'dex' || sortKey === 'name'} direction={sortDesc ? 'desc' : 'asc'} onClick={() => sortBy(sortKey === 'dex' ? 'name' : 'dex')}>
										{sortKey === 'name' ? 'Pal (by Name)' : 'Pal (by Number)'}
									</TableSortLabel>
								</TableCell>
								<TableCell sx={{ width: 76 }}>Type</TableCell>
								<TableCell sx={{ width: 120 }}>Caught</TableCell>
								{WORK_KINDS.map((kind, i) => (
									<TableCell key={kind} align="center" className={`work${i === 0 ? ' first' : ''}${i === WORK_KINDS.length - 1 ? ' last' : ''}`} sx={{ width: 40 }}>
										<Tooltip title={WORK_INFO[kind].label}>
											<TableSortLabel
												active={sortKey === kind}
												direction={sortDesc ? 'desc' : 'asc'}
												onClick={() => sortBy(kind)}
												hideSortIcon
												sx={{ opacity: sortKey === kind ? 1 : 0.75, borderBottom: 2, borderColor: sortKey === kind ? 'primary.main' : 'transparent' }}
											>
												<WorkIcon kind={kind} size={22} />
											</TableSortLabel>
										</Tooltip>
									</TableCell>
								))}
								<TableCell>Found In</TableCell>
							</TableRow>
						</TableHead>
						<TableBody>
							{shown.map((p) => (
								<PalRow key={p.id} pal={p} wanted={wantedIds.has(p.id)} caught={catches[p.id] ?? 0} onSetCatches={setCatches} onShowOnMap={openPalOnMap} onMenu={openMenu} />
							))}
						</TableBody>
					</Table>
				</TableContainer>
			)}
			<PalMenu menu={menu} onClose={() => setMenu(null)} />
		</Paper>
	)
}
