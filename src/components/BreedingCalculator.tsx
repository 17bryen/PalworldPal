import { useMemo, useState } from 'react'
import { Box, Checkbox, FormControlLabel, IconButton, InputAdornment, Paper, TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography } from '@mui/material'
import SwapIcon from '@mui/icons-material/SwapHoriz'
import SearchIcon from '@mui/icons-material/Search'
import AddIcon from '@mui/icons-material/Add'
import ArrowIcon from '@mui/icons-material/ArrowForward'
import { getPal, palIndex, pals, type Gender } from '../data/gamedata'
import { breedingTarget, childrenOf, isSpecialResult, parentsOf } from '../data/breeding'
import { useStore } from '../state/store'
import { GenderIcon, PalAvatar } from './bits'
import { LazyItem, LazyScroll } from './lazy'
import { PalPicker } from './pickers'

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

/** A pal in a result; clicking it looks up its own parents */
function PalTag({ palId, gender, onPick }: { palId: string; gender?: Gender; onPick?: (palId: string) => void }) {
	const caught = (useStore().catches[palId] ?? 0) > 0
	return (
		<Tooltip title={onPick ? 'Find its parents' : ''}>
			<Box
				onClick={onPick && (() => onPick(palId))}
				sx={{
					display: 'flex',
					alignItems: 'center',
					gap: 1,
					flex: 1,
					minWidth: 0,
					p: 0.5,
					borderRadius: 1.5,
					cursor: onPick ? 'pointer' : 'default',
					'&:hover': onPick ? { bgcolor: 'action.hover' } : undefined
				}}
			>
				<Box sx={{ opacity: caught ? 1 : 0.55 }}>
					<PalAvatar palId={palId} size={32} />
				</Box>
				<Box sx={{ minWidth: 0 }}>
					<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
						<Typography variant="body2" fontWeight={600} noWrap>
							{getPal(palId).name}
						</Typography>
						{gender && <GenderIcon gender={gender} size={15} />}
					</Box>
					<BreedingNumber palId={palId} />
				</Box>
			</Box>
		</Tooltip>
	)
}

function FindParents({ child, setChild }: { child: string | null; setChild: (id: string | null) => void }) {
	const catches = useStore().catches
	const [filter, setFilter] = useState('')
	const [caughtOnly, setCaughtOnly] = useState(false)
	const caught = (i: number) => (catches[pals[i].id] ?? 0) > 0

	const pairs = useMemo(() => {
		if (!child) return []
		const q = filter.trim().toLowerCase()
		return parentsOf(palIndex(child))
			.map((p) => (pals[p.a].name.localeCompare(pals[p.b].name) <= 0 ? p : { a: p.b, b: p.a, aGender: p.bGender, bGender: p.aGender }))
			.filter((p) => !caughtOnly || (caught(p.a) && caught(p.b)))
			.filter((p) => !q || pals[p.a].name.toLowerCase().includes(q) || pals[p.b].name.toLowerCase().includes(q))
			.sort((x, y) => Number(caught(y.a) && caught(y.b)) - Number(caught(x.a) && caught(x.b)) || pals[x.a].name.localeCompare(pals[y.a].name) || pals[x.b].name.localeCompare(pals[y.b].name))
	}, [child, filter, caughtOnly, catches])

	return (
		<>
			<Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2, p: 2, borderBottom: 1, borderColor: 'divider' }}>
				<Box sx={{ width: 300 }}>
					<PalPicker value={child} onChange={setChild} label="Child" />
				</Box>
				{child && (
					<>
						<TextField
							size="small"
							placeholder="Filter parents"
							value={filter}
							onChange={(e) => setFilter(e.target.value)}
							slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }}
							sx={{ width: 220 }}
						/>
						<FormControlLabel control={<Checkbox size="small" checked={caughtOnly} onChange={(e) => setCaughtOnly(e.target.checked)} />} label="Only pals I've caught" />
						<Typography variant="body2" color="text.secondary" sx={{ ml: 'auto' }}>
							{pairs.length} pair{pairs.length === 1 ? '' : 's'}
						</Typography>
					</>
				)}
			</Box>
			{!child ? (
				<Hint text="Pick a pal to see every pair that hatches it." />
			) : !pairs.length ? (
				<Hint text={caughtOnly ? "None of these pairs use only pals you've caught." : 'No pair matches that filter.'} />
			) : (
				<LazyScroll sx={{ px: 1 }}>
					{pairs.map((p) => (
						<LazyItem key={`${p.a}-${p.b}-${p.aGender ?? ''}`} estimate={53}>
							<Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1, py: 0.5, maxWidth: 760, borderBottom: 1, borderColor: 'divider' }}>
								<PalTag palId={pals[p.a].id} gender={p.aGender} onPick={setChild} />
								<AddIcon fontSize="small" sx={{ color: 'text.secondary' }} />
								<PalTag palId={pals[p.b].id} gender={p.bGender} onPick={setChild} />
							</Box>
						</LazyItem>
					))}
				</LazyScroll>
			)}
		</>
	)
}

function FindChild({ onPickChild }: { onPickChild: (id: string) => void }) {
	const [a, setA] = useState<string | null>(null)
	const [b, setB] = useState<string | null>(null)
	const outcomes = a && b ? childrenOf(palIndex(a), palIndex(b)) : []
	return (
		<>
			<Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1, p: 2, borderBottom: 1, borderColor: 'divider' }}>
				<Box sx={{ width: 300 }}>
					<PalPicker value={a} onChange={setA} label="Parent 1" />
				</Box>
				<Tooltip title="Swap">
					<IconButton
						onClick={() => {
							setA(b)
							setB(a)
						}}
					>
						<SwapIcon />
					</IconButton>
				</Tooltip>
				<Box sx={{ width: 300 }}>
					<PalPicker value={b} onChange={setB} label="Parent 2" />
				</Box>
			</Box>
			{!a || !b ? (
				<Hint text="Pick two parents to see what hatches." />
			) : (
				<Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
					{outcomes.map((o) => (
						<Paper key={`${o.child}-${o.aGender ?? ''}`} variant="outlined" sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 2, maxWidth: 760 }}>
							<PalTag palId={a} gender={o.aGender} />
							<AddIcon sx={{ color: 'text.secondary' }} />
							<PalTag palId={b} gender={o.bGender} />
							<ArrowIcon sx={{ color: 'text.secondary' }} />
							<PalTag palId={pals[o.child].id} onPick={onPickChild} />
						</Paper>
					))}
					<Typography variant="body2" color="text.secondary">
						{explain(a, b, outcomes.map((o) => o.child))}
					</Typography>
				</Box>
			)}
		</>
	)
}

function explain(a: string, b: string, children: number[]): string {
	if (a === b) return 'Two of the same pal always hatch that pal.'
	if (children.length > 1) return 'This pair hatches a different pal depending on which parent is male.'
	const child = children[0]
	if (isSpecialResult(child)) return `${pals[child].name} only comes from special pairs like this one, not from the average.`
	const pa = getPal(a)
	const pb = getPal(b)
	return `(${pa.breedingPower} + ${pb.breedingPower} + 1) / 2 = ${breedingTarget(pa, pb)}, and ${pals[child].name} (${pals[child].breedingPower}) is the closest.`
}

function Hint({ text }: { text: string }) {
	return (
		<Typography variant="body2" color="text.secondary" sx={{ p: 3, textAlign: 'center' }}>
			{text}
		</Typography>
	)
}

export function BreedingCalculator() {
	const [mode, setMode] = useState<'parents' | 'child'>('parents')
	const [child, setChild] = useState<string | null>(null)
	return (
		<Paper variant="outlined" sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
			<Box sx={{ px: 2, pt: 2 }}>
				<ToggleButtonGroup size="small" exclusive value={mode} onChange={(_, v: 'parents' | 'child' | null) => v && setMode(v)}>
					<ToggleButton value="parents">Find parents</ToggleButton>
					<ToggleButton value="child">Find child</ToggleButton>
				</ToggleButtonGroup>
			</Box>
			{/* Both stay mounted so switching keeps what was picked */}
			<Box sx={{ display: mode === 'parents' ? 'flex' : 'none', flexDirection: 'column', flex: 1, minHeight: 0 }}>
				<FindParents child={child} setChild={setChild} />
			</Box>
			<Box sx={{ display: mode === 'child' ? 'flex' : 'none', flexDirection: 'column', flex: 1, minHeight: 0 }}>
				<FindChild
					onPickChild={(id) => {
						setChild(id)
						setMode('parents')
					}}
				/>
			</Box>
		</Paper>
	)
}
