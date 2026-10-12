import { createContext, Fragment, useContext, useMemo, useState } from 'react'
import { Box, Checkbox, Chip, MenuItem, Paper, TextField, Tooltip, Typography } from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import ArrowIcon from '@mui/icons-material/ArrowForward'
import { getPal, palIndex, type Gender } from '../data/gamedata'
import { parentsOf } from '../data/breeding'
import { buildLadder, type LadderStep } from '../data/ladder'
import { CATCH_TARGET } from '../data/paldeck'
import { useStore } from '../state/store'
import { useGamePals } from '../state/bridge'
import { describeLocation, type PalLocation } from '../state/gamepals'
import { GenderIcon, PalAvatar } from './bits'
import { BreedingNumber } from './BreedingCalculator'
import { LazyItem, LazyScroll } from './lazy'

const GOAL_KEY = 'palbreeder.ladderGoal'
const DONE_KEY = 'palbreeder.ladderDone'

/** A step is the same step while its child and parents are; the ladder reshuffles as catches sync */
const stepKey = (s: LadderStep) => `${s.child}|${s.a}|${s.b}`

function readDone(): Set<string> {
	try {
		const list = JSON.parse(localStorage.getItem(DONE_KEY) ?? '[]')
		return new Set(Array.isArray(list) ? list.filter((k) => typeof k === 'string') : [])
	} catch {
		return new Set()
	}
}

function readGoal(): number {
	try {
		const n = Number(localStorage.getItem(GOAL_KEY))
		return n >= 1 && n <= CATCH_TARGET ? n : CATCH_TARGET
	} catch {
		return CATCH_TARGET
	}
}

/** Your pals' spots in the game, by species, for the parent tooltips */
type Spot = { gender: Gender; where: string; order: number }
const SpotsContext = createContext<Map<string, Spot[]>>(new Map())
const MAX_SPOTS = 8

function useSpots(): Map<string, Spot[]> {
	const owned = useStore().owned
	const gamePals = useGamePals()
	return useMemo(() => {
		const whereByKey = new Map(gamePals.map((g) => [g.key, g.where]))
		// Party first, then the Palbox in page order; unknown spots last
		const order = (w?: PalLocation) => (!w ? Infinity : w.box === 'party' ? w.slot : 1000 + w.slot)
		const spots = new Map<string, Spot[]>()
		for (const o of owned) {
			const w = o.game ? whereByKey.get(o.game) : undefined
			const where = !o.game ? 'added by hand' : w ? describeLocation(w) : 'not seen in the game this session'
			if (!spots.has(o.palId)) spots.set(o.palId, [])
			spots.get(o.palId)!.push({ gender: o.gender, where, order: order(w) })
		}
		for (const list of spots.values()) list.sort((a, b) => a.order - b.order)
		return spots
	}, [owned, gamePals])
}

/** Where to find this parent: your pals of that species (and gender), or an earlier round */
function SpotsTip({ palId, gender }: { palId: string; gender?: Gender }) {
	const all = useContext(SpotsContext).get(palId) ?? []
	const spots = all.filter((s) => !gender || s.gender === gender)
	if (!spots.length) return <>{all.length ? `None of your ${getPal(palId).name} are ${gender === 'M' ? 'male' : 'female'}` : 'Hatched in an earlier round'}</>
	return (
		<Box>
			{spots.slice(0, MAX_SPOTS).map((s, i) => (
				<Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
					<GenderIcon gender={s.gender} size={13} />
					{s.where}
				</Box>
			))}
			{spots.length > MAX_SPOTS && <Box>and {spots.length - MAX_SPOTS} more</Box>}
		</Box>
	)
}

function Parent({ palId, gender, locate }: { palId: string; gender?: Gender; locate?: boolean }) {
	const body = (
		<Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1, minWidth: 0, cursor: locate ? 'help' : undefined }}>
			<PalAvatar palId={palId} size={30} />
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
	)
	return locate ? (
		<Tooltip title={<SpotsTip palId={palId} gender={gender} />} placement="top-start">
			{body}
		</Tooltip>
	) : (
		body
	)
}

function StepRow({ step, done, onToggle }: { step: LadderStep; done: boolean; onToggle: () => void }) {
	return (
		<Box
			sx={{
				display: 'grid',
				gridTemplateColumns: 'auto 1fr auto 1fr auto 1.2fr',
				alignItems: 'center',
				gap: 1,
				pl: 1,
				pr: 2,
				py: 0.75,
				borderBottom: 1,
				borderColor: 'divider',
				'& > :not(:first-child)': { opacity: done ? 0.5 : 1 }
			}}
		>
			<Checkbox size="small" checked={done} onChange={onToggle} sx={{ p: 0.5 }} />
			<Parent palId={step.a} gender={step.aGender} locate />
			<AddIcon fontSize="small" sx={{ color: 'text.secondary' }} />
			<Parent palId={step.b} gender={step.bGender} locate />
			<ArrowIcon fontSize="small" sx={{ color: 'text.secondary' }} />
			<Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
				<Parent palId={step.child} />
				{step.caught > 0 && <Chip size="small" variant="outlined" label={`${step.caught} Caught`} />}
				<Chip size="small" color="primary" label={`Hatch ${step.eggs}`} />
			</Box>
		</Box>
	)
}

function stuckReason(id: string): string {
	const i = palIndex(id)
	return parentsOf(i).every((p) => p.a === i && p.b === i) ? 'only two of itself hatch it' : "its parents aren't in reach yet"
}

export function XpLadder() {
	const { catches, owned } = useStore()
	const [goal, setGoal] = useState(readGoal)
	const ladder = useMemo(() => buildLadder(owned, catches, goal), [owned, catches, goal])
	const spots = useSpots()
	const [done, setDone] = useState(readDone)
	const toggle = (key: string) =>
		setDone((prev) => {
			const next = new Set(prev)
			if (!next.delete(key)) next.add(key)
			// Steps that left the ladder (their catches are done) drop their checkmark
			const live = new Set(ladder.steps.map(stepKey))
			const kept = [...next].filter((k) => live.has(k))
			try {
				localStorage.setItem(DONE_KEY, JSON.stringify(kept))
			} catch {
				// Only a convenience; the checkmarks still work for this session
			}
			return new Set(kept)
		})

	const changeGoal = (n: number) => {
		setGoal(n)
		try {
			localStorage.setItem(GOAL_KEY, String(n))
		} catch {
			// Only a convenience
		}
	}

	return (
		<SpotsContext.Provider value={spots}>
			<Paper variant="outlined" sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
				<Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2, p: 2, borderBottom: 1, borderColor: 'divider' }}>
					<Tooltip title="Every hatch counts as a catch. Stop hatching a pal once it has this many." placement="top">
						<TextField select size="small" label="Catches per Pal" value={goal} onChange={(e) => changeGoal(Number(e.target.value))} sx={{ width: 150 }}>
							{Array.from({ length: CATCH_TARGET }, (_, i) => i + 1).map((n) => (
								<MenuItem key={n} value={n}>
									{n}
								</MenuItem>
							))}
						</TextField>
					</Tooltip>
					{owned.length > 0 && (
						<Typography variant="body2" color="text.secondary">
							{ladder.steps.length} pal{ladder.steps.length === 1 ? '' : 's'} to hatch over {ladder.rounds} round{ladder.rounds === 1 ? '' : 's'}, {ladder.eggs} egg
							{ladder.eggs === 1 ? '' : 's'}
						</Typography>
					)}
				</Box>
				{!owned.length ? (
					<Typography variant="body2" color="text.secondary" sx={{ p: 3, textAlign: 'center' }}>
						Your ladder starts from My pals. Add them in the Planner, or from the game through Game link.
					</Typography>
				) : (
					<LazyScroll>
						{ladder.steps.map((s, i) => (
							<Fragment key={`${s.child}-${s.round}`}>
								{(i === 0 || ladder.steps[i - 1].round !== s.round) && (
									<Typography variant="overline" color="text.secondary" component="div" sx={{ px: 2, pt: 1.5 }}>
										Round {s.round}
										{s.round === 1 ? ': From My Pals' : `: Using Round ${s.round - 1} Hatches`}
									</Typography>
								)}
								<LazyItem estimate={53}>
									<StepRow step={s} done={done.has(stepKey(s))} onToggle={() => toggle(stepKey(s))} />
								</LazyItem>
							</Fragment>
						))}
						{ladder.stuck.length > 0 && (
							<Box sx={{ p: 2 }}>
								<Typography variant="overline" color="text.secondary">
									Can't Hatch From My Pals ({ladder.stuck.length})
								</Typography>
								<Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mt: 0.5 }}>
									{ladder.stuck.map((id) => (
										<Tooltip key={id} title={`${getPal(id).name}: ${stuckReason(id)}`}>
											<Box sx={{ opacity: 0.6 }}>
												<PalAvatar palId={id} size={28} />
											</Box>
										</Tooltip>
									))}
								</Box>
							</Box>
						)}
					</LazyScroll>
				)}
			</Paper>
		</SpotsContext.Provider>
	)
}
