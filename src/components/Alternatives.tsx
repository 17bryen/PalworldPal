import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import {
	Box,
	Button,
	Chip,
	Dialog,
	DialogActions,
	DialogContent,
	DialogTitle,
	InputAdornment,
	List,
	ListItemButton,
	TextField,
	Typography
} from '@mui/material'
import SearchIcon from '@mui/icons-material/Search'
import AddIcon from '@mui/icons-material/Add'
import { getPal, palIndex, pals } from '../data/gamedata'
import { parentPairs } from '../data/lineage'
import { catchMinutes } from '../solver/solver'
import { pinKey, type OwnedPal, type PlanNode, type PlanSettings } from '../solver/types'
import { useStore } from '../state/store'
import { PalAvatar, PassiveList } from './bits'

type ParentStatus = { kind: 'owned'; carries: string[] } | { kind: 'catch'; minutes: number } | { kind: 'breed' }

/** Rough effort to get the next breeding step of a breed-only parent, for ranking */
const BREED_SCORE = 60

function parentStatus(palId: string, owned: OwnedPal[], settings: PlanSettings, wanted: string[]): ParentStatus {
	const mine = owned.filter((o) => o.palId === palId)
	if (mine.length) {
		// The owned one carrying the most of the passives this pal needs
		const carries = mine.map((o) => wanted.filter((w) => o.passives.includes(w))).sort((a, b) => b.length - a.length)[0]
		return { kind: 'owned', carries }
	}
	const minutes = catchMinutes(palIndex(palId), settings, false)
	return minutes != null ? { kind: 'catch', minutes } : { kind: 'breed' }
}

const score = (s: ParentStatus) => (s.kind === 'owned' ? 0 : s.kind === 'catch' ? s.minutes : BREED_SCORE)
const carried = (s: ParentStatus) => (s.kind === 'owned' ? s.carries : [])

function StatusLabel({ status }: { status: ParentStatus }) {
	if (status.kind === 'owned') return <Chip size="small" color="success" variant="outlined" label="Owned" />
	if (status.kind === 'catch') return <Chip size="small" color="secondary" variant="outlined" label={`Catch, ~${Math.round(status.minutes)} min`} />
	return <Chip size="small" variant="outlined" label="Breed" />
}

function AlternativesDialog({ node, onClose }: { node: PlanNode; onClose: () => void }) {
	const { owned, settings, setPin } = useStore()
	const [search, setSearch] = useState('')
	const key = pinKey(node.palId, node.passives)
	const pin = settings.pins[key]
	const current = node.parents?.map((p) => p.palId)

	const options = useMemo(() => {
		const seen = new Set<string>()
		return parentPairs[palIndex(node.palId)]
			.map(([ia, ib]) => {
				const a = pals[ia].id
				const b = pals[ib].id
				const sa = parentStatus(a, owned, settings, node.passives)
				const sb = parentStatus(b, owned, settings, node.passives)
				// Pairs whose owned parents already bring the needed passives come first
				const brings = new Set([...carried(sa), ...carried(sb)]).size
				const isCurrent = !!current && [a, b].sort().join() === [...current].sort().join()
				return { a, b, sa, sb, score: (isCurrent ? -1e6 : 0) - brings * 1000 + score(sa) + score(sb) }
			})
			.filter((o) => {
				const id = [o.a, o.b].sort().join('+')
				if (seen.has(id)) return false
				seen.add(id)
				return true
			})
			.sort((x, y) => x.score - y.score)
	}, [node.palId, node.passives, owned, settings, current?.join()])

	const q = search.trim().toLowerCase()
	const shown = options.filter((o) => !q || getPal(o.a).name.toLowerCase().includes(q) || getPal(o.b).name.toLowerCase().includes(q))
	const isCurrent = (a: string, b: string) => !!current && [a, b].sort().join() === [...current].sort().join()
	const canCatch = !node.passives.length && catchMinutes(palIndex(node.palId), settings, false) != null

	const choose = (a: string, b: string) => {
		setPin(key, { kind: 'pair', a, b })
		onClose()
	}

	return (
		<Dialog open onClose={onClose} maxWidth="sm" fullWidth>
			<DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
				<PalAvatar palId={node.palId} size={36} />
				<Box>
					<Typography variant="h6">Ways to Get {getPal(node.palId).name}</Typography>
					<PassiveList passives={node.passives} />
				</Box>
			</DialogTitle>
			<DialogContent dividers sx={{ p: 0 }}>
				<Box sx={{ p: 1.5, display: 'flex', gap: 1, alignItems: 'center' }}>
					<TextField
						size="small"
						fullWidth
						placeholder="Filter by parent"
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
					{canCatch && (
						<Button
							variant={pin?.kind === 'catch' ? 'contained' : 'outlined'}
							onClick={() => {
								setPin(key, { kind: 'catch' })
								onClose()
							}}
							sx={{ whiteSpace: 'nowrap' }}
						>
							Catch It
						</Button>
					)}
				</Box>
				<List dense disablePadding sx={{ maxHeight: 420, overflowY: 'auto' }}>
					{shown.map((o) => {
						const selected = isCurrent(o.a, o.b)
						return (
							<ListItemButton key={`${o.a}+${o.b}`} selected={selected} onClick={() => choose(o.a, o.b)} sx={{ gap: 1 }}>
								<ParentCell palId={o.a} status={o.sa} />
								<AddIcon fontSize="small" color="disabled" />
								<ParentCell palId={o.b} status={o.sb} />
								{selected && <Chip size="small" color="primary" label={pin ? 'Chosen' : 'In plan'} sx={{ ml: 'auto' }} />}
							</ListItemButton>
						)
					})}
				</List>
			</DialogContent>
			<DialogActions>
				{pin && (
					<Button
						onClick={() => {
							setPin(key, null)
							onClose()
						}}
					>
						Let the Planner Choose
					</Button>
				)}
				<Button onClick={onClose}>Close</Button>
			</DialogActions>
		</Dialog>
	)
}

function ParentCell({ palId, status }: { palId: string; status: ParentStatus }) {
	return (
		<Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1, minWidth: 0 }}>
			<PalAvatar palId={palId} size={28} />
			<Box sx={{ flex: 1, minWidth: 0 }}>
				<Typography variant="body2" fontWeight={600} noWrap>
					{getPal(palId).name}
				</Typography>
				{/* Passives this pal needs that the owned parent already has */}
				{status.kind === 'owned' && <PassiveList passives={status.carries} />}
			</Box>
			<StatusLabel status={status} />
		</Box>
	)
}

const AlternativesContext = createContext<(node: PlanNode) => void>(() => {})

/** Lets any plan view open the alternatives picker for a bred pal */
export function AlternativesProvider({ children }: { children: ReactNode }) {
	const [node, setNode] = useState<PlanNode | null>(null)
	return (
		<AlternativesContext.Provider value={setNode}>
			{children}
			{node && <AlternativesDialog node={node} onClose={() => setNode(null)} />}
		</AlternativesContext.Provider>
	)
}

export function useAlternatives() {
	return useContext(AlternativesContext)
}
