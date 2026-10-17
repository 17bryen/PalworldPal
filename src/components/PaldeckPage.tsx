import { memo, startTransition, useCallback, useEffect, useMemo, useState } from 'react'
import {
	Box,
	Button,
	Checkbox,
	Chip,
	LinearProgress,
	FormControlLabel,
	IconButton,
	InputAdornment,
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
	Tooltip,
	Typography
} from '@mui/material'
import SearchIcon from '@mui/icons-material/Search'
import StarIcon from '@mui/icons-material/Star'
import StarBorderIcon from '@mui/icons-material/StarBorder'
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown'
import LinkIcon from '@mui/icons-material/Link'
import AddIcon from '@mui/icons-material/Add'
import RemoveIcon from '@mui/icons-material/Remove'
import CheckIcon from '@mui/icons-material/Check'
import { pals, WORK_KINDS, type PalInfo, type WorkKind } from '../data/gamedata'
import { legendaryLine } from '../data/lineage'
import { OTHER_REGION, REGIONS, regionName, spawnRegions } from '../data/regions'
import { useActions, useStoreSelect } from '../state/store'
import { useNavigation } from '../state/nav'
import { useBridge } from '../state/bridge'
import { palHabitat } from '../data/map'
import { CATCH_TARGET } from '../data/paldeck'
import { rarityColor } from '../theme'
import type { CatchPref } from '../solver/types'
import { PalAvatar, WORK_INFO, WorkIcon } from './bits'

type SortKey = 'dex' | 'name' | 'rarity' | WorkKind
type BreedFilter = 'any' | 'legendaryLine'
type LegendFilter = 'any' | 'only' | 'none'
type AccessFilter = 'any' | 'reachable' | 'unreachable'
type CaughtFilter = 'any' | 'need' | 'done'

const PREF_LABEL: Record<CatchPref | 'default', string> = { default: 'Normal', easy: 'Easy', hard: 'Hard', never: 'Never' }
const PREF_COLOR: Partial<Record<CatchPref, string>> = { easy: 'success.main', never: 'error.main', hard: 'warning.main' }

/** Short region names for the table; the full list is in the cell's hover text */
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

/** Catch counter: minus, count (click to mark complete or clear), plus */
function CatchStepper({ palId, count, onSet }: { palId: string; count: number; onSet: (id: string, n: number) => void }) {
	const done = count >= CATCH_TARGET
	return (
		<Box sx={{ display: 'flex', alignItems: 'center' }}>
			<IconButton size="small" disableRipple disabled={count === 0} title="One fewer" onClick={() => onSet(palId, count - 1)}>
				<RemoveIcon sx={{ fontSize: 16 }} />
			</IconButton>
			<Box
				component="button"
				title={done ? 'Clear catches' : 'Mark all caught'}
				onClick={() => onSet(palId, done ? 0 : CATCH_TARGET)}
				sx={{
					all: 'unset',
					cursor: 'pointer',
					minWidth: 44,
					height: 24,
					borderRadius: 12,
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					fontSize: 13,
					fontWeight: 700,
					fontVariantNumeric: 'tabular-nums',
					color: done ? 'success.main' : count ? 'text.primary' : 'text.disabled',
					bgcolor: done ? 'rgba(111,207,138,0.12)' : 'transparent',
					'&:hover': { bgcolor: 'action.hover' }
				}}
			>
				{done ? <CheckIcon sx={{ fontSize: 18 }} /> : `${count}/${CATCH_TARGET}`}
			</Box>
			<IconButton size="small" disableRipple disabled={done} title="Caught one" onClick={() => onSet(palId, count + 1)}>
				<AddIcon sx={{ fontSize: 16 }} />
			</IconButton>
		</Box>
	)
}

// Rows render a lot of cells; plain elements and native hover titles keep the page quick
const PalRow = memo(function PalRow({
	pal,
	checked,
	wanted,
	pref,
	caught,
	onCheck,
	onToggleWanted,
	onPrefMenu,
	onSetCatches,
	onShowOnMap
}: {
	pal: PalInfo
	checked: boolean
	wanted: boolean
	pref: CatchPref | undefined
	caught: number
	onSetCatches: (id: string, n: number) => void
	onShowOnMap: (id: string) => void
	onCheck: (id: string) => void
	onToggleWanted: (id: string, wanted: boolean) => void
	onPrefMenu: (id: string, anchor: HTMLElement) => void
}) {
	const regions = spawnRegions(pal.id)
	return (
		<TableRow hover selected={checked}>
			<TableCell padding="checkbox">
				<Checkbox size="small" disableRipple checked={checked} onChange={() => onCheck(pal.id)} />
			</TableCell>
			<TableCell>
				<Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
					<PalAvatar palId={pal.id} size={28} />
					<Box sx={{ minWidth: 0 }}>
						<Typography variant="body2" fontWeight={600} noWrap sx={{ color: pal.legendary ? rarityColor(20) : undefined }}>
							{pal.name}
						</Typography>
						<Typography variant="caption" color="text.secondary">
							#{pal.dex}
						</Typography>
					</Box>
					{legendaryLine.has(pal.id) && (
						<Chip
							size="small"
							variant="outlined"
							label="Self-Bred"
							title="Can only be bred from itself or legendary pals"
							sx={{ ml: 'auto', color: rarityColor(20), borderColor: `${rarityColor(20)}66` }}
						/>
					)}
				</Box>
			</TableCell>
			<TableCell>
				<CatchStepper palId={pal.id} count={caught} onSet={onSetCatches} />
			</TableCell>
			<TableCell align="center">
				<Typography variant="body2" sx={{ color: rarityColor(pal.rarity), fontWeight: 600 }}>
					{pal.rarity}
				</Typography>
			</TableCell>
			{WORK_KINDS.map((kind) => {
				const level = pal.work[kind]
				return (
					<TableCell key={kind} align="center" sx={{ px: 0.5 }}>
						{level > 0 && (
							<Typography variant="body2" sx={{ color: WORK_INFO[kind].color, fontWeight: 700, opacity: 0.45 + level * 0.11 }}>
								{level}
							</Typography>
						)}
					</TableCell>
				)
			})}
			<TableCell sx={{ maxWidth: 200 }}>
				<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
					<Typography
						variant="caption"
						color={regions.length ? 'text.primary' : 'text.disabled'}
						sx={{ display: 'block', lineHeight: 1.3, flex: 1 }}
						title={regions.map(regionName).join(', ')}
					>
						{regions.length ? regions.map((r) => SHORT[r] ?? r).join(', ') : 'Not wild'}
					</Typography>
					{palHabitat[pal.id]?.length > 0 && (
						<IconButton size="small" disableRipple title="Show on map" onClick={() => onShowOnMap(pal.id)} sx={{ color: 'primary.main' }}>
							<LinkIcon sx={{ fontSize: 18 }} />
						</IconButton>
					)}
				</Box>
			</TableCell>
			<TableCell>
				{regions.length > 0 && (
					<Button
						size="small"
						disableRipple
						endIcon={<ArrowDropDownIcon />}
						onClick={(e) => onPrefMenu(pal.id, e.currentTarget)}
						sx={{ minWidth: 0, px: 0.5, color: (pref && PREF_COLOR[pref]) || 'text.primary', fontWeight: 500 }}
					>
						{PREF_LABEL[pref ?? 'default']}
					</Button>
				)}
			</TableCell>
			<TableCell padding="checkbox">
				<IconButton size="small" disableRipple title={wanted ? 'Remove from Target Pals' : 'Add to Target Pals'} onClick={() => onToggleWanted(pal.id, wanted)}>
					{wanted ? <StarIcon fontSize="small" sx={{ color: rarityColor(20) }} /> : <StarBorderIcon fontSize="small" />}
				</IconButton>
			</TableCell>
		</TableRow>
	)
})

export function PaldeckPage() {
	const wanted = useStoreSelect((s) => s.wanted)
	const settings = useStoreSelect((s) => s.settings)
	const catches = useStoreSelect((s) => s.catches)
	const syncCatches = useStoreSelect((s) => s.syncCatches)
	const actions = useActions()
	const [search, setSearch] = useState('')
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
	const [checked, setChecked] = useState<Set<string>>(new Set())
	const [prefMenu, setPrefMenu] = useState<{ id: string; anchor: HTMLElement } | null>(null)

	// The first rows show at once; the rest render in the background so opening the page never stalls
	const [rowLimit, setRowLimit] = useState(50)
	useEffect(() => startTransition(() => setRowLimit(Infinity)), [])

	const wantedIds = useMemo(() => new Set(wanted.map((w) => w.palId)), [wanted])
	const disabledRegions = settings.disabledRegions

	const rows = useMemo(() => {
		const q = search.trim().toLowerCase()
		const list = pals.filter((p) => {
			const regions = spawnRegions(p.id)
			const reachable = regions.some((r) => !disabledRegions.includes(r))
			return (
				(!q || p.name.toLowerCase().includes(q)) &&
				(work === 'any' || p.work[work] >= minLevel) &&
				(region === 'any' || (onlyThere ? regions.length === 1 && regions[0] === region : regions.includes(region))) &&
				(access === 'any' || (access === 'reachable' ? reachable : !reachable)) &&
				(caughtFilter === 'any' || ((catches[p.id] ?? 0) >= CATCH_TARGET) === (caughtFilter === 'done')) &&
				(breed === 'any' || legendaryLine.has(p.id)) &&
				(legend === 'any' || (legend === 'only' ? p.legendary : !p.legendary))
			)
		})
		const value = (p: PalInfo): number | string =>
			sortKey === 'dex' ? p.dex + (p.variant ? 0.5 : 0) : sortKey === 'name' ? p.name : sortKey === 'rarity' ? p.rarity : p.work[sortKey]
		return list.sort((a, b) => {
			const va = value(a)
			const vb = value(b)
			const cmp = typeof va === 'string' ? va.localeCompare(vb as string) : va - (vb as number)
			return (sortDesc ? -cmp : cmp) || a.dex - b.dex
		})
	}, [search, work, minLevel, region, onlyThere, access, caughtFilter, catches, disabledRegions, breed, legend, sortKey, sortDesc])

	const completed = useMemo(() => pals.filter((p) => (catches[p.id] ?? 0) >= CATCH_TARGET).length, [catches])

	const sortBy = (key: SortKey) => {
		if (key === sortKey) setSortDesc(!sortDesc)
		else {
			setSortKey(key)
			// Work levels and rarity read best highest first
			setSortDesc(key !== 'dex' && key !== 'name')
		}
	}

	const chooseWork = (kind: WorkKind | 'any') => {
		setWork(kind)
		if (kind !== 'any') {
			setSortKey(kind)
			setSortDesc(true)
		}
	}

	const onCheck = useCallback(
		(id: string) =>
			setChecked((c) => {
				const next = new Set(c)
				if (next.has(id)) next.delete(id)
				else next.add(id)
				return next
			}),
		[]
	)
	const { addWantedMany, removeWantedPal, setCatchPref, setCatches } = actions
	const { openPalOnMap } = useNavigation()
	const { captures } = useBridge()
	const fromGame = !!captures && syncCatches
	const onToggleWanted = useCallback((id: string, wanted: boolean) => (wanted ? removeWantedPal(id) : addWantedMany([id])), [addWantedMany, removeWantedPal])
	const onPrefMenu = useCallback((id: string, anchor: HTMLElement) => setPrefMenu({ id, anchor }), [])

	const allChecked = rows.length > 0 && rows.every((p) => checked.has(p.id))

	return (
		<Paper variant="outlined" sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
			<Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1.5, p: 1.5, borderBottom: 1, borderColor: 'divider' }}>
				<TextField
					size="small"
					placeholder="Search pals"
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					sx={{ width: 180 }}
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
				<TextField select size="small" label="Region" value={region} onChange={(e) => setRegion(e.target.value)} sx={{ width: 190 }}>
					<MenuItem value="any">Any</MenuItem>
					{[...REGIONS, OTHER_REGION].map((r) => (
						<MenuItem key={r.key} value={r.key}>
							{r.name}
						</MenuItem>
					))}
				</TextField>
				{region !== 'any' && (
					<FormControlLabel control={<Checkbox size="small" checked={onlyThere} onChange={(e) => setOnlyThere(e.target.checked)} />} label="Only There" />
				)}
				<Tooltip title="Based on the regions turned on in Map access" placement="top">
					<TextField select size="small" label="Map Access" value={access} onChange={(e) => setAccess(e.target.value as AccessFilter)} sx={{ width: 150 }}>
						<MenuItem value="any">Any</MenuItem>
						<MenuItem value="reachable">Can Catch</MenuItem>
						<MenuItem value="unreachable">Can't Catch</MenuItem>
					</TextField>
				</Tooltip>
				<TextField select size="small" label="Breeding" value={breed} onChange={(e) => setBreed(e.target.value as BreedFilter)} sx={{ width: 210 }}>
					<MenuItem value="any">Any</MenuItem>
					<MenuItem value="legendaryLine">Only From Itself or Legendaries</MenuItem>
				</TextField>
				<TextField select size="small" label="Caught" value={caughtFilter} onChange={(e) => setCaughtFilter(e.target.value as CaughtFilter)} sx={{ width: 130 }}>
					<MenuItem value="any">Any</MenuItem>
					<MenuItem value="need">Still Need</MenuItem>
					<MenuItem value="done">Done</MenuItem>
				</TextField>
				<TextField select size="small" label="Legendary" value={legend} onChange={(e) => setLegend(e.target.value as LegendFilter)} sx={{ width: 120 }}>
					<MenuItem value="any">Any</MenuItem>
					<MenuItem value="only">Only</MenuItem>
					<MenuItem value="none">Hide</MenuItem>
				</TextField>
				<Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 1 }}>
					{checked.size > 0 ? (
						<>
							<Button onClick={() => setChecked(new Set())}>Clear</Button>
							<Button
								variant="contained"
								onClick={() => {
									addWantedMany([...checked])
									setChecked(new Set())
								}}
							>
								Add {checked.size} to Target Pals
							</Button>
						</>
					) : (
						<Box sx={{ width: 250, whiteSpace: 'nowrap' }} title={`${completed} of ${pals.length} pals caught ${CATCH_TARGET} times`}>
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
					)}
				</Box>
			</Box>
			<TableContainer sx={{ flex: 1, minHeight: 0 }}>
				<Table size="small" stickyHeader>
					<TableHead>
						<TableRow>
							<TableCell padding="checkbox">
								<Checkbox
									size="small"
									checked={allChecked}
									indeterminate={!allChecked && rows.some((p) => checked.has(p.id))}
									onChange={() => setChecked(allChecked ? new Set() : new Set(rows.map((p) => p.id)))}
								/>
							</TableCell>
							<TableCell sx={{ minWidth: 250 }}>
								<TableSortLabel
									active={sortKey === 'dex' || sortKey === 'name'}
									direction={sortDesc ? 'desc' : 'asc'}
									onClick={() => sortBy(sortKey === 'dex' ? 'name' : 'dex')}
								>
									{sortKey === 'name' ? 'Pal (by Name)' : 'Pal (by Number)'}
								</TableSortLabel>
							</TableCell>
							<TableCell>Caught</TableCell>
							<TableCell align="center">
								<TableSortLabel active={sortKey === 'rarity'} direction={sortDesc ? 'desc' : 'asc'} onClick={() => sortBy('rarity')}>
									Rarity
								</TableSortLabel>
							</TableCell>
							{WORK_KINDS.map((kind) => (
								<TableCell key={kind} align="center" sx={{ px: 0.5 }}>
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
							<TableCell>
								<Tooltip title="How easy this pal is for you to find. Plans favor easy catches and never suggest Never.">
									<span>Catching</span>
								</Tooltip>
							</TableCell>
							<TableCell padding="checkbox" />
						</TableRow>
					</TableHead>
					<TableBody>
						{rows.slice(0, rowLimit).map((p) => (
							<PalRow
								key={p.id}
								pal={p}
								checked={checked.has(p.id)}
								wanted={wantedIds.has(p.id)}
								pref={settings.catchPrefs[p.id]}
								onCheck={onCheck}
								onToggleWanted={onToggleWanted}
								onPrefMenu={onPrefMenu}
								caught={catches[p.id] ?? 0}
								onSetCatches={setCatches}
								onShowOnMap={openPalOnMap}
							/>
						))}
					</TableBody>
				</Table>
			</TableContainer>
			<Menu anchorEl={prefMenu?.anchor} open={!!prefMenu} onClose={() => setPrefMenu(null)}>
				{(['default', 'easy', 'hard', 'never'] as const).map((pref) => (
					<MenuItem
						key={pref}
						selected={(settings.catchPrefs[prefMenu?.id ?? ''] ?? 'default') === pref}
						onClick={() => {
							if (prefMenu) setCatchPref(prefMenu.id, pref === 'default' ? null : pref)
							setPrefMenu(null)
						}}
					>
						{PREF_LABEL[pref]}
					</MenuItem>
				))}
			</Menu>
		</Paper>
	)
}
