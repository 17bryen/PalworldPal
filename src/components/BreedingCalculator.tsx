import { memo, useMemo, useState, type ReactNode } from 'react'
import {
	Box,
	ButtonBase,
	Checkbox,
	FormControlLabel,
	IconButton,
	InputAdornment,
	MenuItem,
	Paper,
	Tab,
	Tabs,
	TextField,
	ToggleButton,
	ToggleButtonGroup,
	Tooltip,
	Typography
} from '@mui/material'
import SearchIcon from '@mui/icons-material/Search'
import AddIcon from '@mui/icons-material/Add'
import CloseIcon from '@mui/icons-material/Close'
import SwapIcon from '@mui/icons-material/SwapHoriz'
import ArrowUpIcon from '@mui/icons-material/ArrowUpward'
import ArrowDownIcon from '@mui/icons-material/ArrowDownward'
import EggIcon from '@mui/icons-material/EggOutlined'
import { getPal, palIndex, pals, type Gender, type PalInfo } from '../data/gamedata'
import { breedingTarget, childrenOf, isSpecialResult, parentsOf } from '../data/breeding'
import { useStore } from '../state/store'
import { rarityColor } from '../theme'
import { GenderIcon, PalAvatar } from './bits'
import { LazyItem, LazyScroll } from './lazy'


/** A pal's hidden breeding number, small, next to its name */
export function BreedingNumber({ palId }: { palId: string }) {
	return (
		<Tooltip title="Breeding number; lower is stronger">
			<Typography component="span" variant="caption" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums' }}>
				{getPal(palId).breedingPower}
			</Typography>
		</Tooltip>
	)
}

/** Species in My pals, for the "Only My pals" filters */
function useMyPalIds(): Set<string> {
	const owned = useStore().owned
	return useMemo(() => new Set(owned.map((o) => o.palId)), [owned])
}

// ---- The big selection boxes ----

/** A big box holding one chosen pal, labelled above */
function Slot({
	label,
	palId,
	placeholder,
	active,
	onClick,
	onClear,
	hint
}: {
	label: ReactNode
	palId: string | null
	placeholder: string
	active?: boolean
	onClick?: () => void
	onClear?: () => void
	hint?: string
}) {
	const pal = palId ? getPal(palId) : null
	const color = pal ? rarityColor(pal.rarity) : null
	return (
		<Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.75, flexShrink: 0 }}>
			<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: 'text.secondary' }}>{label}</Box>
			<Tooltip title={hint ?? ''}>
				<Box sx={{ position: 'relative' }}>
					<ButtonBase
						onClick={onClick}
						disabled={!onClick}
						sx={{
							width: 176,
							height: 176,
							borderRadius: 3,
							border: 2,
							borderStyle: pal ? 'solid' : 'dashed',
							borderColor: active ? 'primary.main' : color ? `${color}99` : 'divider',
							background: color ? `radial-gradient(circle at 50% 38%, ${color}2e, transparent 70%)` : 'rgba(255,255,255,0.02)',
							display: 'flex',
							flexDirection: 'column',
							gap: 1,
							transition: 'border-color 150ms'
						}}
					>
						{pal ? (
							<>
								<PalAvatar palId={pal.id} size={96} />
								<Box sx={{ textAlign: 'center', px: 1, maxWidth: '100%' }}>
									<Typography variant="subtitle2" fontWeight={700} noWrap>
										{pal.name}
									</Typography>
									<Typography variant="caption" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums' }}>
										{pal.breedingPower}
									</Typography>
								</Box>
							</>
						) : (
							<Typography variant="body2" sx={{ color: active ? 'primary.main' : 'text.secondary' }}>
								{placeholder}
							</Typography>
						)}
					</ButtonBase>
					{pal && onClear && (
						<IconButton size="small" onClick={onClear} sx={{ position: 'absolute', top: 4, right: 4, opacity: 0.6, '&:hover': { opacity: 1 } }}>
							<CloseIcon sx={{ fontSize: 16 }} />
						</IconButton>
					)}
				</Box>
			</Tooltip>
		</Box>
	)
}

const SlotLabel = ({ text, gender }: { text: string; gender?: Gender }) => (
	<>
		{gender && <GenderIcon gender={gender} size={16} />}
		<Typography variant="overline" sx={{ lineHeight: 1.6 }}>
			{text}
		</Typography>
	</>
)

// ---- The pal grid you pick from ----

type SortKey = 'name' | 'dex' | 'power'

const SORTS: Record<SortKey, (a: PalInfo, b: PalInfo) => number> = {
	name: (a, b) => a.name.localeCompare(b.name),
	dex: (a, b) => a.dex - b.dex || Number(a.variant) - Number(b.variant),
	power: (a, b) => a.breedingPower - b.breedingPower
}

const PalCard = memo(function PalCard({ palId, selected, mine, onPick }: { palId: string; selected: boolean; mine: boolean; onPick: (id: string) => void }) {
	const pal = getPal(palId)
	return (
		<ButtonBase
			onClick={() => onPick(palId)}
			sx={{
				display: 'flex',
				flexDirection: 'column',
				gap: 0.5,
				p: 1,
				pt: 1.25,
				borderRadius: 1.5,
				border: 1,
				borderColor: selected ? 'primary.main' : 'divider',
				bgcolor: selected ? 'action.selected' : 'rgba(255,255,255,0.03)',
				'&:hover': { bgcolor: 'action.hover', borderColor: selected ? 'primary.main' : 'rgba(255,255,255,0.2)' }
			}}
		>
			<Box sx={{ position: 'relative' }}>
				<PalAvatar palId={palId} size={56} />
				{mine && (
					<Box
						title="In My pals"
						sx={{ position: 'absolute', bottom: 0, right: 0, width: 12, height: 12, borderRadius: '50%', bgcolor: 'success.main', border: 2, borderColor: 'background.paper' }}
					/>
				)}
			</Box>
			<Typography variant="body2" fontWeight={600} noWrap sx={{ maxWidth: '100%' }}>
				{pal.name}
			</Typography>
			<Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
				{pal.breedingPower}
			</Typography>
		</ButtonBase>
	)
})

function PalGrid({ selected, onPick }: { selected: (string | null)[]; onPick: (id: string) => void }) {
	const mine = useMyPalIds()
	const [search, setSearch] = useState('')
	const [sort, setSort] = useState<SortKey>('name')
	const [descending, setDescending] = useState(false)
	const [onlyMine, setOnlyMine] = useState(false)
	const shown = useMemo(() => {
		const q = search.trim().toLowerCase()
		const list = pals.filter((p) => (!q || p.name.toLowerCase().includes(q)) && (!onlyMine || mine.has(p.id))).sort(SORTS[sort])
		return descending ? list.reverse() : list
	}, [search, sort, descending, onlyMine, mine])

	return (
		<Box sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>
			<Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5, flexWrap: 'wrap' }}>
				<TextField
					size="small"
					placeholder="Search for a pal"
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					sx={{ flex: '1 1 200px' }}
					slotProps={{
						input: {
							startAdornment: (
								<InputAdornment position="start">
									<SearchIcon fontSize="small" />
								</InputAdornment>
							),
						}
					}}
				/>
				<TextField select size="small" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} sx={{ width: 170 }}>
					<MenuItem value="name">Name</MenuItem>
					<MenuItem value="dex">Paldeck number</MenuItem>
					<MenuItem value="power">Breeding number</MenuItem>
				</TextField>
				<Tooltip title={descending ? 'Descending' : 'Ascending'}>
					<IconButton size="small" onClick={() => setDescending((d) => !d)}>
						{descending ? <ArrowDownIcon fontSize="small" /> : <ArrowUpIcon fontSize="small" />}
					</IconButton>
				</Tooltip>
				<FormControlLabel control={<Checkbox size="small" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} />} label="Only My pals" />
			</Box>
			<Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', pr: 0.5 }}>
				<Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(108px, 1fr))', gap: 1 }}>
					{shown.map((p) => (
						<PalCard key={p.id} palId={p.id} selected={selected.includes(p.id)} mine={mine.has(p.id)} onPick={onPick} />
					))}
				</Box>
				{!shown.length && (
					<Typography variant="body2" color="text.secondary" sx={{ p: 3, textAlign: 'center' }}>
						No pal matches.
					</Typography>
				)}
			</Box>
		</Box>
	)
}

// ---- Breed two parents ----

function explain(a: string, b: string, children: number[]): string {
	if (a === b) return 'Two of the same pal always hatch that pal.'
	if (children.length > 1) return 'This pair hatches a different pal depending on which parent is male.'
	const child = children[0]
	if (isSpecialResult(child)) return `${pals[child].name} only comes from special pairs like this one.`
	const pa = getPal(a)
	const pb = getPal(b)
	return `(${pa.breedingPower} + ${pb.breedingPower} + 1) / 2 = ${breedingTarget(pa, pb)}, and ${pals[child].name} (${pals[child].breedingPower}) is the closest.`
}

function BreedTwo({ onFindCombos }: { onFindCombos: (id: string) => void }) {
	const [parents, setParents] = useState<[string | null, string | null]>([null, null])
	const [active, setActive] = useState<0 | 1>(0)
	const [a, b] = parents
	const outcomes = a && b ? childrenOf(palIndex(a), palIndex(b)) : []
	// The first parent is the male; for gender-specific pairs that decides the child
	const outcome = outcomes.find((o) => !o.aGender || o.aGender === 'M') ?? outcomes[0]
	const child = outcome ? pals[outcome.child].id : null

	const pick = (id: string) => {
		const next: [string | null, string | null] = [a, b]
		next[active] = id
		setParents(next)
		if (active === 0 && !next[1]) setActive(1)
	}
	const clear = (i: 0 | 1) => {
		const next: [string | null, string | null] = [a, b]
		next[i] = null
		setParents(next)
		setActive(i)
	}

	return (
		<Box sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>
			<Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2.5, pt: 2 }}>
				<Slot
					label={<SlotLabel text="Father" gender="M" />}
					palId={a}
					placeholder="Pick a pal below"
					active={active === 0}
					onClick={() => setActive(0)}
					onClear={() => clear(0)}
				/>
				<Tooltip title="Swap parents">
					<IconButton onClick={() => setParents([b, a])} sx={{ mt: 3 }}>
						<SwapIcon />
					</IconButton>
				</Tooltip>
				<Slot
					label={<SlotLabel text="Mother" gender="F" />}
					palId={b}
					placeholder="Pick a pal below"
					active={active === 1}
					onClick={() => setActive(1)}
					onClear={() => clear(1)}
				/>
				<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 3, color: 'primary.main' }}>
					<Box sx={{ width: 28, height: 2, bgcolor: 'currentColor', opacity: 0.5 }} />
					<EggIcon />
					<Box sx={{ width: 28, height: 2, bgcolor: 'currentColor', opacity: 0.5 }} />
				</Box>
				<Slot
					label={<SlotLabel text="Hatches" />}
					palId={child}
					placeholder="..."
					onClick={child ? () => onFindCombos(child) : undefined}
					hint={child ? 'Every way to get it' : undefined}
				/>
			</Box>
			<Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', minHeight: 24, mt: 2, mb: 2 }}>
				{a && b ? explain(a, b, outcomes.map((o) => o.child)) : ''}
			</Typography>
			<PalGrid selected={[a, b]} onPick={pick} />
		</Box>
	)
}

// ---- Every combination for one pal ----

function ResultPal({ palId, gender, onPick }: { palId: string; gender?: Gender; onPick: (id: string) => void }) {
	return (
		<ButtonBase
			onClick={() => onPick(palId)}
			sx={{ display: 'flex', alignItems: 'center', gap: 1.25, flex: 1, minWidth: 0, justifyContent: 'flex-start', p: 0.75, borderRadius: 1.5, '&:hover': { bgcolor: 'action.hover' } }}
		>
			<PalAvatar palId={palId} size={44} />
			<Box sx={{ minWidth: 0, textAlign: 'left' }}>
				<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
					<Typography variant="body2" fontWeight={600} noWrap>
						{getPal(palId).name}
					</Typography>
					{gender && <GenderIcon gender={gender} size={15} />}
				</Box>
				<Typography variant="caption" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums' }}>
					{getPal(palId).breedingPower}
				</Typography>
			</Box>
		</ButtonBase>
	)
}

interface ComboRow {
	key: string
	a: string
	b: string
	aGender?: Gender
	bGender?: Gender
	/** Set on "as a parent" rows */
	child?: string
}

function Combinations({ palId, setPalId }: { palId: string | null; setPalId: (id: string) => void }) {
	const mine = useMyPalIds()
	const [tab, setTab] = useState<'child' | 'parent'>('child')
	const [search, setSearch] = useState('')
	const [onlyMine, setOnlyMine] = useState(false)

	const { asChild, asParent } = useMemo(() => {
		if (!palId) return { asChild: [] as ComboRow[], asParent: [] as ComboRow[] }
		const me = palIndex(palId)
		const asChild: ComboRow[] = parentsOf(me).map((p) => {
			const swap = pals[p.a].name.localeCompare(pals[p.b].name) > 0
			const [a, b, aGender, bGender] = swap ? [p.b, p.a, p.bGender, p.aGender] : [p.a, p.b, p.aGender, p.bGender]
			return { key: `${a}-${b}-${aGender ?? ''}`, a: pals[a].id, b: pals[b].id, aGender, bGender }
		})
		const asParent: ComboRow[] = []
		for (let other = 0; other < pals.length; other++) {
			for (const o of childrenOf(me, other)) {
				asParent.push({ key: `${other}-${o.aGender ?? ''}`, a: palId, b: pals[other].id, aGender: o.aGender, bGender: o.bGender, child: pals[o.child].id })
			}
		}
		return { asChild, asParent }
	}, [palId])

	const rows = useMemo(() => {
		const q = search.trim().toLowerCase()
		const named = (id: string) => getPal(id).name.toLowerCase().includes(q)
		const both = (r: ComboRow) => mine.has(r.a) && mine.has(r.b)
		const list = tab === 'child' ? asChild : asParent
		return list
			.filter((r) => !q || named(r.a) || named(r.b) || (!!r.child && named(r.child)))
			.filter((r) => !onlyMine || (tab === 'child' ? both(r) : mine.has(r.b)))
			.sort((x, y) =>
				tab === 'child'
					? Number(both(y)) - Number(both(x)) || getPal(x.a).name.localeCompare(getPal(y.a).name) || getPal(x.b).name.localeCompare(getPal(y.b).name)
					: getPal(x.child!).name.localeCompare(getPal(y.child!).name) || getPal(x.b).name.localeCompare(getPal(y.b).name)
			)
	}, [tab, asChild, asParent, search, onlyMine, mine])

	return (
		<Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(420px, 1fr) minmax(460px, 1.1fr)', gap: 2, minHeight: 0, flex: 1, pt: 3 }}>
			<Box sx={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
				<Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
					<Slot label={<SlotLabel text="Pal" />} palId={palId} placeholder="Pick a pal below" active={!palId} />
				</Box>
				<PalGrid selected={[palId]} onPick={setPalId} />
			</Box>
			<Paper variant="outlined" sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, bgcolor: 'rgba(255,255,255,0.02)' }}>
				<Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1.5, pb: 0.5 }}>
					<TextField
						size="small"
						placeholder="Search these pairs"
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						sx={{ flex: 1 }}
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
					<FormControlLabel control={<Checkbox size="small" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} />} label="Only My pals" sx={{ mr: 0 }} />
				</Box>
				<Tabs value={tab} onChange={(_, v) => setTab(v)} variant="fullWidth" sx={{ borderBottom: 1, borderColor: 'divider' }}>
					<Tab value="child" label={`Its parents${palId ? ` (${asChild.length})` : ''}`} />
					<Tab value="parent" label={`What it hatches${palId ? ` (${asParent.length})` : ''}`} />
				</Tabs>
				{!palId ? (
					<Typography variant="body2" color="text.secondary" sx={{ p: 3, textAlign: 'center' }}>
						Pick a pal to see every pair that hatches it, and everything it hatches.
					</Typography>
				) : !rows.length ? (
					<Typography variant="body2" color="text.secondary" sx={{ p: 3, textAlign: 'center' }}>
						{onlyMine ? 'None of these use only My pals.' : 'No pair matches that search.'}
					</Typography>
				) : (
					<LazyScroll>
						{rows.map((r) => (
							<LazyItem key={r.key} estimate={67}>
								<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, px: 1, py: 0.5, borderBottom: 1, borderColor: 'divider' }}>
									{tab === 'child' ? (
										<>
											<ResultPal palId={r.a} gender={r.aGender} onPick={setPalId} />
											<AddIcon fontSize="small" sx={{ color: 'text.secondary' }} />
											<ResultPal palId={r.b} gender={r.bGender} onPick={setPalId} />
										</>
									) : (
										<>
											<ResultPal palId={r.b} gender={r.bGender} onPick={setPalId} />
											<Typography sx={{ color: 'text.secondary', px: 0.5 }}>=</Typography>
											<ResultPal palId={r.child!} onPick={setPalId} />
										</>
									)}
								</Box>
							</LazyItem>
						))}
					</LazyScroll>
				)}
			</Paper>
		</Box>
	)
}

// ---- Page ----

export function BreedingCalculator() {
	const [mode, setMode] = useState<'two' | 'combos'>('two')
	const [comboPal, setComboPal] = useState<string | null>(null)
	return (
		<Paper variant="outlined" sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, p: 2 }}>
			<ToggleButtonGroup size="small" exclusive value={mode} onChange={(_, v: 'two' | 'combos' | null) => v && setMode(v)} sx={{ alignSelf: 'flex-start' }}>
				<ToggleButton value="two">Two parents</ToggleButton>
				<ToggleButton value="combos">One pal</ToggleButton>
			</ToggleButtonGroup>
			{/* Both stay mounted so switching keeps what was picked */}
			<Box sx={{ display: mode === 'two' ? 'flex' : 'none', flexDirection: 'column', flex: 1, minHeight: 0 }}>
				<BreedTwo
					onFindCombos={(id) => {
						setComboPal(id)
						setMode('combos')
					}}
				/>
			</Box>
			<Box sx={{ display: mode === 'combos' ? 'flex' : 'none', flexDirection: 'column', flex: 1, minHeight: 0 }}>
				<Combinations palId={comboPal} setPalId={setComboPal} />
			</Box>
		</Paper>
	)
}
