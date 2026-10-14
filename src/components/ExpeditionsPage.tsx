import { Fragment, useMemo, useState } from 'react'
import {
	Alert,
	Box,
	ButtonBase,
	Chip,
	Dialog,
	DialogContent,
	DialogTitle,
	IconButton,
	InputAdornment,
	Paper,
	TextField,
	ToggleButton,
	ToggleButtonGroup,
	Tooltip,
	Typography
} from '@mui/material'
import UndoIcon from '@mui/icons-material/Undo'
import GroupsIcon from '@mui/icons-material/GroupsOutlined'
import { getPal } from '../data/gamedata'
import {
	autoAssign,
	expeditions,
	firepower,
	palElements,
	payout,
	rewardRate,
	TEAM_CAP,
	type Candidate,
	type Expedition,
	type PalStats,
	type RewardOption,
	type Team
} from '../data/expeditions'
import { useGamePals } from '../state/bridge'
import { useStore } from '../state/store'
import { PalAvatar } from './bits'

const asset = (file: string) => `${import.meta.env.BASE_URL}${file}`
const LAB_KEY = 'palbreeder.expeditionLab'
const MAX_COMPARE = 2
const RISK_COLOR: Record<string, string> = { Low: '#6fcf8a', Medium: '#f0c35c', High: '#f0a85c', Highest: '#f07a7a' }

function readLab(): number {
	try {
		const n = Number(localStorage.getItem(LAB_KEY))
		return n >= 0 && n <= 35 ? n : 0
	} catch {
		return 0
	}
}

const formatMinutes = (m: number) => (m >= 60 ? `${m / 60}h` : `${m}m`)
const formatFirepower = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : `${Math.round(n)}`)

export function ElementBadge({ element, count }: { element: string; count?: number }) {
	return (
		<Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }} title={`${element} element`}>
			<img src={asset(`elements/${element}.webp`)} alt="" width={18} height={18} />
			<Typography variant="caption" fontWeight={600}>
				{count != null ? `${count}x ${element}` : element}
			</Typography>
		</Box>
	)
}

function ItemIcon({ option, size = 28 }: { option: RewardOption; size?: number }) {
	return option.icon ? (
		<img src={asset(`items/${option.icon}.webp`)} alt="" width={size} height={size} style={{ flexShrink: 0 }} />
	) : (
		<Box sx={{ width: size, height: size, flexShrink: 0 }} />
	)
}

/** Palbox pals with stats from the game: this session's reads, else what My Pals last saved */
function useCandidates(): Candidate[] {
	const owned = useStore().owned
	const gamePals = useGamePals()
	return useMemo(() => {
		const byKey = new Map<string, { palId: string; stats: PalStats; box?: string }>()
		for (const o of owned) if (o.game && o.stats) byKey.set(o.game, { palId: o.palId, stats: o.stats, box: o.box })
		for (const g of gamePals) if (g.stats) byKey.set(g.key, { palId: g.palId, stats: g.stats, box: g.where?.box })
		return [...byKey]
			.filter(([, p]) => p.box === 'palbox')
			.map(([key, p]) => ({ key, palId: p.palId, firepower: firepower(p.palId, p.stats) }))
	}, [owned, gamePals])
}

function ExpeditionCard({
	expedition: e,
	team,
	rate,
	selected,
	onClick
}: {
	expedition: Expedition
	team: Team | null
	rate: number | null
	selected: number
	onClick: () => void
}) {
	const short = team && !team.meetsRequirement
	return (
		<ButtonBase
			onClick={onClick}
			sx={{
				display: 'block',
				width: '100%',
				textAlign: 'left',
				p: 1.5,
				borderRadius: 2,
				border: 1,
				borderColor: selected >= 0 ? 'primary.main' : 'divider',
				bgcolor: selected >= 0 ? 'action.selected' : 'rgba(255,255,255,0.02)',
				'&:hover': { borderColor: selected >= 0 ? 'primary.main' : 'rgba(255,255,255,0.2)' }
			}}
		>
			<Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
				{selected >= 0 && (
					<Box sx={{ width: 20, height: 20, borderRadius: '50%', bgcolor: 'primary.main', color: 'background.default', fontSize: 12, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
						{'AB'[selected]}
					</Box>
				)}
				<Typography variant="subtitle2" sx={{ flex: 1, minWidth: 0 }} noWrap>
					{e.name}
				</Typography>
				<Chip size="small" variant="outlined" label={e.risk} sx={{ height: 20, color: RISK_COLOR[e.risk], borderColor: `${RISK_COLOR[e.risk]}66` }} />
			</Box>
			<Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mt: 0.75, color: 'text.secondary' }}>
				<Typography variant="caption">{formatMinutes(e.minutes)}</Typography>
				<Typography variant="caption">{formatFirepower(e.firepower)} Firepower</Typography>
				{e.require && <ElementBadge element={e.require.element} count={e.require.count} />}
				<Box sx={{ flex: 1 }} />
				{short ? (
					<Typography variant="caption" color="warning.main" fontWeight={700}>
						{team!.elementCount}/{e.require!.count} {e.require!.element}
					</Typography>
				) : rate != null ? (
					<Typography variant="body2" fontWeight={800} sx={{ color: rate >= 100 ? 'success.main' : 'warning.main', fontVariantNumeric: 'tabular-nums' }}>
						~{Math.round(rate)}%
					</Typography>
				) : null}
			</Box>
		</ButtonBase>
	)
}

function TeamDialog({ expedition, team, onClose }: { expedition: Expedition; team: Team; onClose: () => void }) {
	const element = expedition.require?.element
	return (
		<Dialog open onClose={onClose} maxWidth="md" fullWidth>
			<DialogTitle>Auto-Assign Team: {expedition.name}</DialogTitle>
			<DialogContent dividers>
				<Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
					{team.members.length} pals, {formatFirepower(team.firepower)} firepower ({(team.firepower / expedition.firepower).toFixed(1)}x the recommended)
					{element ? `, ${team.elementCount} ${element}` : ''}
				</Typography>
				<Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 1 }}>
					{team.members.map((m) => (
						<Box
							key={m.key}
							sx={{
								display: 'flex',
								alignItems: 'center',
								gap: 1,
								p: 0.75,
								borderRadius: 1.5,
								border: 1,
								borderColor: element && palElements(m.palId).includes(element) ? 'primary.main' : 'divider'
							}}
						>
							<PalAvatar palId={m.palId} size={28} />
							<Box sx={{ minWidth: 0 }}>
								<Typography variant="caption" fontWeight={600} noWrap component="div">
									{getPal(m.palId).name}
								</Typography>
								<Typography variant="caption" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums' }}>
									{formatFirepower(m.firepower)}
								</Typography>
							</Box>
						</Box>
					))}
				</Box>
			</DialogContent>
		</Dialog>
	)
}

interface Column {
	expedition: Expedition
	team: Team | null
	estimate: number | null
	rate: number | null
}

/** Each item's payout in every compared expedition, by run or by hour */
function Comparison({ columns, perHour }: { columns: Column[]; perHour: boolean }) {
	// One row per item, in the first expedition's slot order, then what only the second has
	const rows = useMemo(() => {
		const order: string[] = []
		const info = new Map<string, { option: RewardOption; pool: number[] }>()
		columns.forEach((c, ci) =>
			c.expedition.rewards.forEach((slot) =>
				slot.forEach((o) => {
					if (!info.has(o.item)) {
						order.push(o.item)
						info.set(o.item, { option: o, pool: [] })
					}
					info.get(o.item)!.pool[ci] = slot.length
				})
			)
		)
		return order.map((item) => ({ item, ...info.get(item)! }))
	}, [columns])

	const value = (c: Column, item: string) => {
		for (const slot of c.expedition.rewards) {
			const o = slot.find((x) => x.item === item)
			if (o && c.rate != null) {
				const p = payout(o, c.rate)
				const scale = perHour ? 60 / c.expedition.minutes : 1
				return { min: p.min * scale, max: p.max * scale, avg: ((p.min + p.max) / 2) * scale }
			}
		}
		return null
	}
	const fmt = (n: number) => (perHour && n % 1 ? n.toFixed(1) : String(Math.round(n)))

	return (
		<Box sx={{ display: 'grid', gridTemplateColumns: `minmax(220px, 1.4fr) repeat(${columns.length}, minmax(120px, 1fr))`, alignItems: 'center' }}>
			{rows.map((r) => {
				const values = columns.map((c) => value(c, r.item))
				const best = Math.max(...values.map((v) => v?.avg ?? -1))
				return (
					<Fragment key={r.item}>
						<Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, py: 0.75, pr: 1, borderBottom: 1, borderColor: 'divider', minWidth: 0 }}>
							<ItemIcon option={r.option} />
							<Typography variant="body2" fontWeight={600} noWrap>
								{r.item}
							</Typography>
						</Box>
						{values.map((v, i) => {
							const pool = r.pool[i]
							// Only worth pointing out when every compared expedition pays this item
							const better = columns.length > 1 && values.every((x) => x != null) && v != null && v.avg === best && values.filter((x) => x?.avg === best).length === 1
							return (
								<Box key={i} sx={{ py: 0.75, px: 1, borderBottom: 1, borderColor: 'divider', textAlign: 'center' }}>
									{v ? (
										<Tooltip title={pool > 1 ? `One of ${pool} possible items in this slot` : ''}>
											<Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
												<Typography
													variant="body2"
													fontWeight={better ? 800 : 500}
													sx={{ color: better ? 'success.main' : 'text.primary', fontVariantNumeric: 'tabular-nums' }}
												>
													{v.min === v.max ? fmt(v.min) : `${fmt(v.min)}-${fmt(v.max)}`}
												</Typography>
												{pool > 1 && <Chip size="small" variant="outlined" label={`1 of ${pool}`} sx={{ height: 18, fontSize: 10 }} />}
											</Box>
										</Tooltip>
									) : (
										<Typography variant="body2" color="text.disabled">
											-
										</Typography>
									)}
								</Box>
							)
						})}
					</Fragment>
				)
			})}
		</Box>
	)
}

export function ExpeditionsPage() {
	const candidates = useCandidates()
	const [lab, setLab] = useState(readLab)
	const [selected, setSelected] = useState<string[]>([])
	const [overrides, setOverrides] = useState<Record<string, string>>({})
	const [perHour, setPerHour] = useState(false)
	const [teamOf, setTeamOf] = useState<string | null>(null)

	const teams = useMemo(() => new Map(expeditions.map((e) => [e.name, candidates.length ? autoAssign(candidates, e) : null])), [candidates])
	const estimate = (e: Expedition) => {
		const team = teams.get(e.name)
		return team && team.meetsRequirement ? rewardRate(team.firepower, e.firepower, lab) : null
	}

	const toggle = (name: string) =>
		setSelected((s) => (s.includes(name) ? s.filter((n) => n !== name) : [...s, name].slice(-MAX_COMPARE)))

	const changeLab = (n: number) => {
		const v = Math.max(0, Math.min(35, n || 0))
		setLab(v)
		try {
			localStorage.setItem(LAB_KEY, String(v))
		} catch {
			// Only a convenience
		}
	}

	const columns: Column[] = selected.map((name) => {
		const e = expeditions.find((x) => x.name === name)!
		const est = estimate(e)
		const typed = overrides[name]
		const rate = typed != null && typed !== '' && Number(typed) > 0 ? Number(typed) : est
		return { expedition: e, team: teams.get(name) ?? null, estimate: est, rate }
	})
	const teamFor = teamOf ? expeditions.find((e) => e.name === teamOf) : null

	return (
		<Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(380px, 440px) 1fr', gap: 2, height: '100%', minHeight: 0 }}>
			<Paper variant="outlined" sx={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
				<Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 1.5, borderBottom: 1, borderColor: 'divider' }}>
					<Tooltip title="Expedition reward research at the Pal Labor Research Laboratory; up to +35%">
						<TextField
							size="small"
							type="number"
							label="Lab Research Bonus"
							value={lab}
							onChange={(e) => changeLab(Number(e.target.value))}
							slotProps={{ input: { endAdornment: <InputAdornment position="end">%</InputAdornment> } }}
							sx={{ width: 170 }}
						/>
					</Tooltip>
					<Typography variant="caption" color="text.secondary">
						{candidates.length ? `${candidates.length} Palbox pals with stats` : ''}
					</Typography>
				</Box>
				<Box sx={{ overflowY: 'auto', p: 1.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
					{[false, true].map((hard) => (
						<Fragment key={String(hard)}>
							<Typography variant="overline" color="text.secondary" sx={{ mt: hard ? 1 : 0 }}>
								{hard ? 'Hard Mode' : 'Standard'}
							</Typography>
							{expeditions
								.filter((e) => e.hard === hard)
								.map((e) => (
									<ExpeditionCard key={e.name} expedition={e} team={teams.get(e.name) ?? null} rate={estimate(e)} selected={selected.indexOf(e.name)} onClick={() => toggle(e.name)} />
								))}
						</Fragment>
					))}
				</Box>
			</Paper>

			<Paper variant="outlined" sx={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
				{!candidates.length && (
					<Alert severity="info" sx={{ m: 1.5, mb: 0 }}>
						Reward estimates need your pals' stats from the game: update the mod in Game Link, restart Palworld, then open your Palbox pages. Until then, type the reward % the game shows.
					</Alert>
				)}
				{!columns.length ? (
					<Typography variant="body2" color="text.secondary" sx={{ p: 4, textAlign: 'center' }}>
						Pick one or two expeditions to see what they pay.
					</Typography>
				) : (
					<>
						<Box sx={{ display: 'grid', gridTemplateColumns: `minmax(220px, 1.4fr) repeat(${columns.length}, minmax(120px, 1fr))`, gap: 0, p: 1.5, pb: 1, borderBottom: 1, borderColor: 'divider' }}>
							<Box sx={{ display: 'flex', alignItems: 'flex-end' }}>
								<ToggleButtonGroup size="small" exclusive value={perHour ? 'hour' : 'run'} onChange={(_, v) => v && setPerHour(v === 'hour')}>
									<ToggleButton value="run">Per Run</ToggleButton>
									<ToggleButton value="hour">Per Hour</ToggleButton>
								</ToggleButtonGroup>
							</Box>
							{columns.map((c, i) => {
								const typed = overrides[c.expedition.name]
								return (
									<Box key={c.expedition.name} sx={{ px: 1, textAlign: 'center', minWidth: 0 }}>
										<Typography variant="caption" color="primary.main" fontWeight={800}>
											{'AB'[i]}
										</Typography>
										<Typography variant="subtitle2" noWrap title={c.expedition.name}>
											{c.expedition.name}
										</Typography>
										<Typography variant="caption" color="text.secondary" component="div">
											{formatMinutes(c.expedition.minutes)}
											{c.team ? `, team ${formatFirepower(c.team.firepower)} of ${formatFirepower(c.expedition.firepower)}` : ''}
										</Typography>
										<Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.25, mt: 0.75 }}>
											<Tooltip title={c.estimate != null ? `Estimated ${Math.round(c.estimate)}% from your auto-assign team; type what the game shows to use that instead` : 'Type the reward % the game shows'}>
												<TextField
													size="small"
													label="Reward"
													value={typed ?? (c.estimate != null ? String(Math.round(c.estimate)) : '')}
													onChange={(ev) => setOverrides((o) => ({ ...o, [c.expedition.name]: ev.target.value.replace(/[^\d.]/g, '') }))}
													slotProps={{ input: { endAdornment: <InputAdornment position="end">%</InputAdornment> } }}
													sx={{ width: 110 }}
												/>
											</Tooltip>
											{typed != null && c.estimate != null && (
												<Tooltip title="Back to the estimate">
													<IconButton size="small" onClick={() => setOverrides(({ [c.expedition.name]: _, ...rest }) => rest)}>
														<UndoIcon fontSize="small" />
													</IconButton>
												</Tooltip>
											)}
											{c.team && (
												<Tooltip title="The team auto-assign would send">
													<IconButton size="small" onClick={() => setTeamOf(c.expedition.name)}>
														<GroupsIcon fontSize="small" />
													</IconButton>
												</Tooltip>
											)}
										</Box>
										{c.team && !c.team.meetsRequirement && (
											<Typography variant="caption" color="warning.main" component="div" sx={{ mt: 0.5 }}>
												Needs {c.expedition.require!.count} {c.expedition.require!.element}; your Palbox has {c.team.elementCount}
											</Typography>
										)}
									</Box>
								)
							})}
						</Box>
						<Box sx={{ overflowY: 'auto', px: 1.5, pb: 1.5 }}>
							{columns.some((c) => c.rate == null) && (
								<Typography variant="caption" color="text.secondary" component="div" sx={{ py: 1 }}>
									Type a reward % to see payouts.
								</Typography>
							)}
							<Comparison columns={columns} perHour={perHour} />
							<Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 1.5 }}>
								Ranges are the base amounts times the reward %; the game's rounding may differ by an item or so. Firepower follows the community's reading of the game files, at most {TEAM_CAP} pals.
							</Typography>
						</Box>
					</>
				)}
			</Paper>
			{teamFor && teams.get(teamFor.name) && <TeamDialog expedition={teamFor} team={teams.get(teamFor.name)!} onClose={() => setTeamOf(null)} />}
		</Box>
	)
}
