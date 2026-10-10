import { memo, useMemo, useState } from 'react'
import {
	Box,
	Button,
	Checkbox,
	Chip,
	IconButton,
	InputAdornment,
	MenuItem,
	Paper,
	Select,
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
import { pals, WORK_KINDS, type PalInfo, type WorkKind } from '../data/gamedata'
import { legendaryLine } from '../data/lineage'
import { worldTree, type WorldTreePresence } from '../data/regions'
import { useStore } from '../state/store'
import { rarityColor } from '../theme'
import type { CatchPref } from '../solver/types'
import { PalAvatar, WORK_INFO, WorkIcon } from './bits'

type SortKey = 'dex' | 'name' | 'rarity' | WorkKind
type TreeFilter = 'any' | 'only' | 'mostly' | 'found'
type BreedFilter = 'any' | 'legendaryLine'
type LegendFilter = 'any' | 'only' | 'none'

const TREE_LABEL: Record<WorldTreePresence, string> = {
	only: 'World Tree only',
	mostly: 'Mostly World Tree',
	also: 'World Tree'
}
const TREE_TIP: Record<WorldTreePresence, string> = {
	only: 'Only spawns in the World Tree',
	mostly: 'Spawns in the World Tree; elsewhere only as a one-off alpha or similar',
	also: 'Spawns in the World Tree and other regions'
}

function matchesTree(id: string, filter: TreeFilter): boolean {
	if (filter === 'any') return true
	const presence = worldTree.get(id)
	if (filter === 'only') return presence === 'only'
	if (filter === 'mostly') return presence === 'only' || presence === 'mostly'
	return presence !== undefined
}

const PalRow = memo(function PalRow({
	pal,
	checked,
	wanted,
	pref,
	onCheck,
	onToggleWanted,
	onPref
}: {
	pal: PalInfo
	checked: boolean
	wanted: boolean
	pref: CatchPref | undefined
	onCheck: (id: string) => void
	onToggleWanted: (id: string, wanted: boolean) => void
	onPref: (id: string, pref: CatchPref | null) => void
}) {
	const tree = worldTree.get(pal.id)
	return (
		<TableRow hover selected={checked}>
			<TableCell padding="checkbox">
				<Checkbox size="small" checked={checked} onChange={() => onCheck(pal.id)} />
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
					<Box sx={{ display: 'flex', gap: 0.5, ml: 'auto' }}>
						{legendaryLine.has(pal.id) && (
							<Tooltip title="Can only be bred from itself or legendary pals">
								<Chip size="small" variant="outlined" label="Self-bred" sx={{ color: rarityColor(20), borderColor: `${rarityColor(20)}66` }} />
							</Tooltip>
						)}
						{tree && (
							<Tooltip title={TREE_TIP[tree]}>
								<Chip size="small" variant="outlined" label={TREE_LABEL[tree]} color={tree === 'also' ? 'default' : 'success'} />
							</Tooltip>
						)}
					</Box>
				</Box>
			</TableCell>
			<TableCell align="center">
				<Typography variant="body2" sx={{ color: rarityColor(pal.rarity), fontWeight: 600 }}>
					{pal.rarity}
				</Typography>
			</TableCell>
			{WORK_KINDS.map((kind) => {
				const level = pal.work[kind]
				const { color } = WORK_INFO[kind]
				return (
					<TableCell key={kind} align="center" sx={{ px: 0.5 }}>
						{level > 0 && (
							<Typography variant="body2" sx={{ color, fontWeight: 700, opacity: 0.45 + level * 0.11 }}>
								{level}
							</Typography>
						)}
					</TableCell>
				)
			})}
			<TableCell>
				{pal.wild ? (
					<Select
						size="small"
						variant="standard"
						disableUnderline
						value={pref ?? 'default'}
						onChange={(e) => onPref(pal.id, e.target.value === 'default' ? null : (e.target.value as CatchPref))}
						sx={{ fontSize: 13, minWidth: 80, color: pref === 'never' ? 'error.main' : pref === 'easy' ? 'success.main' : undefined }}
					>
						<MenuItem value="default">Normal</MenuItem>
						<MenuItem value="easy">Easy</MenuItem>
						<MenuItem value="hard">Hard</MenuItem>
						<MenuItem value="never">Never</MenuItem>
					</Select>
				) : (
					<Tooltip title="Doesn't spawn in the wild">
						<Typography variant="caption" color="text.disabled">
							Not wild
						</Typography>
					</Tooltip>
				)}
			</TableCell>
			<TableCell padding="checkbox">
				<Tooltip title={wanted ? 'Remove from wanted' : 'Add to wanted'}>
					<IconButton size="small" onClick={() => onToggleWanted(pal.id, wanted)}>
						{wanted ? <StarIcon fontSize="small" sx={{ color: rarityColor(20) }} /> : <StarBorderIcon fontSize="small" />}
					</IconButton>
				</Tooltip>
			</TableCell>
		</TableRow>
	)
})

export function PalsPage() {
	const store = useStore()
	const [search, setSearch] = useState('')
	const [work, setWork] = useState<WorkKind | 'any'>('any')
	const [minLevel, setMinLevel] = useState(1)
	const [tree, setTree] = useState<TreeFilter>('any')
	const [breed, setBreed] = useState<BreedFilter>('any')
	const [legend, setLegend] = useState<LegendFilter>('any')
	const [sortKey, setSortKey] = useState<SortKey>('dex')
	const [sortDesc, setSortDesc] = useState(false)
	const [checked, setChecked] = useState<Set<string>>(new Set())

	const wantedIds = useMemo(() => new Set(store.wanted.map((w) => w.palId)), [store.wanted])

	const rows = useMemo(() => {
		const q = search.trim().toLowerCase()
		const list = pals.filter(
			(p) =>
				(!q || p.name.toLowerCase().includes(q)) &&
				(work === 'any' || p.work[work] >= minLevel) &&
				matchesTree(p.id, tree) &&
				(breed === 'any' || legendaryLine.has(p.id)) &&
				(legend === 'any' || (legend === 'only' ? p.legendary : !p.legendary))
		)
		const value = (p: PalInfo): number | string =>
			sortKey === 'dex' ? p.dex + (p.variant ? 0.5 : 0) : sortKey === 'name' ? p.name : sortKey === 'rarity' ? p.rarity : p.work[sortKey]
		return list.sort((a, b) => {
			const va = value(a)
			const vb = value(b)
			const cmp = typeof va === 'string' ? va.localeCompare(vb as string) : va - (vb as number)
			return (sortDesc ? -cmp : cmp) || a.dex - b.dex
		})
	}, [search, work, minLevel, tree, breed, legend, sortKey, sortDesc])

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

	const onCheck = useMemo(
		() => (id: string) =>
			setChecked((c) => {
				const next = new Set(c)
				if (next.has(id)) next.delete(id)
				else next.add(id)
				return next
			}),
		[]
	)
	const { addWantedMany, removeWantedPal, setCatchPref } = store
	const onToggleWanted = useMemo(
		() => (id: string, wanted: boolean) => (wanted ? removeWantedPal(id) : addWantedMany([id])),
		[addWantedMany, removeWantedPal]
	)

	const allChecked = rows.length > 0 && rows.every((p) => checked.has(p.id))

	return (
		<Paper variant="outlined" sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
			<Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1.5, p: 1.5, borderBottom: 1, borderColor: 'divider' }}>
				<TextField
					size="small"
					placeholder="Search pals"
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					sx={{ width: 200 }}
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
				<TextField select size="small" label="Work" value={work} onChange={(e) => chooseWork(e.target.value as WorkKind | 'any')} sx={{ width: 210 }}>
					<MenuItem value="any">Any</MenuItem>
					{WORK_KINDS.map((kind) => {
						return (
							<MenuItem key={kind} value={kind}>
								<Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
									<WorkIcon kind={kind} />
									{WORK_INFO[kind].label}
								</Box>
							</MenuItem>
						)
					})}
				</TextField>
				{work !== 'any' && (
					<TextField select size="small" label="Min level" value={minLevel} onChange={(e) => setMinLevel(Number(e.target.value))} sx={{ width: 100 }}>
						{[1, 2, 3, 4, 5].map((n) => (
							<MenuItem key={n} value={n}>
								{n}
							</MenuItem>
						))}
					</TextField>
				)}
				<TextField select size="small" label="Breeding" value={breed} onChange={(e) => setBreed(e.target.value as BreedFilter)} sx={{ width: 220 }}>
					<MenuItem value="any">Any</MenuItem>
					<MenuItem value="legendaryLine">Only from itself or legendaries</MenuItem>
				</TextField>
				<TextField select size="small" label="World Tree" value={tree} onChange={(e) => setTree(e.target.value as TreeFilter)} sx={{ width: 170 }}>
					<MenuItem value="any">Any</MenuItem>
					<MenuItem value="only">Only there</MenuItem>
					<MenuItem value="mostly">Mostly there</MenuItem>
					<MenuItem value="found">Found there</MenuItem>
				</TextField>
				<TextField select size="small" label="Legendary" value={legend} onChange={(e) => setLegend(e.target.value as LegendFilter)} sx={{ width: 140 }}>
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
								Add {checked.size} to wanted
							</Button>
						</>
					) : (
						<Typography variant="caption" color="text.secondary">
							{rows.length} pals
						</Typography>
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
							<TableCell sx={{ minWidth: 280 }}>
								<TableSortLabel active={sortKey === 'dex' || sortKey === 'name'} direction={sortDesc ? 'desc' : 'asc'} onClick={() => sortBy(sortKey === 'dex' ? 'name' : 'dex')}>
									{sortKey === 'name' ? 'Pal (by name)' : 'Pal (by number)'}
								</TableSortLabel>
							</TableCell>
							<TableCell align="center">
								<TableSortLabel active={sortKey === 'rarity'} direction={sortDesc ? 'desc' : 'asc'} onClick={() => sortBy('rarity')}>
									Rarity
								</TableSortLabel>
							</TableCell>
							{WORK_KINDS.map((kind) => {
								return (
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
								)
							})}
							<TableCell>
								<Tooltip title="How easy this pal is for you to find. Plans favor easy catches and never suggest Never.">
									<span>Catching</span>
								</Tooltip>
							</TableCell>
							<TableCell padding="checkbox" />
						</TableRow>
					</TableHead>
					<TableBody>
						{rows.map((p) => (
							<PalRow
								key={p.id}
								pal={p}
								checked={checked.has(p.id)}
								wanted={wantedIds.has(p.id)}
								pref={store.settings.catchPrefs[p.id]}
								onCheck={onCheck}
								onToggleWanted={onToggleWanted}
								onPref={setCatchPref}
							/>
						))}
					</TableBody>
				</Table>
			</TableContainer>
		</Paper>
	)
}
