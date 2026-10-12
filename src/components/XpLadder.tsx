import { Fragment, useMemo, useState } from 'react'
import { Box, Chip, MenuItem, Paper, TextField, Tooltip, Typography } from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import ArrowIcon from '@mui/icons-material/ArrowForward'
import { getPal, palIndex } from '../data/gamedata'
import { parentsOf } from '../data/breeding'
import { buildLadder, type LadderStep } from '../data/ladder'
import { CATCH_TARGET } from '../data/paldeck'
import { useStore } from '../state/store'
import { GenderIcon, PalAvatar } from './bits'
import { BreedingNumber } from './BreedingCalculator'
import { LazyItem, LazyScroll } from './lazy'

const GOAL_KEY = 'palbreeder.ladderGoal'

function readGoal(): number {
	try {
		const n = Number(localStorage.getItem(GOAL_KEY))
		return n >= 1 && n <= CATCH_TARGET ? n : CATCH_TARGET
	} catch {
		return CATCH_TARGET
	}
}

function Parent({ palId, gender }: { palId: string; gender?: 'M' | 'F' }) {
	return (
		<Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1, minWidth: 0 }}>
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
}

function StepRow({ step }: { step: LadderStep }) {
	return (
		<Box sx={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr auto 1.2fr', alignItems: 'center', gap: 1, px: 2, py: 0.75, borderBottom: 1, borderColor: 'divider' }}>
			<Parent palId={step.a} gender={step.aGender} />
			<AddIcon fontSize="small" sx={{ color: 'text.secondary' }} />
			<Parent palId={step.b} gender={step.bGender} />
			<ArrowIcon fontSize="small" sx={{ color: 'text.secondary' }} />
			<Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
				<Parent palId={step.child} />
				{step.caught > 0 && <Chip size="small" variant="outlined" label={`${step.caught} caught`} />}
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

	const changeGoal = (n: number) => {
		setGoal(n)
		try {
			localStorage.setItem(GOAL_KEY, String(n))
		} catch {
			// Only a convenience
		}
	}

	return (
		<Paper variant="outlined" sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
			<Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2, p: 2, borderBottom: 1, borderColor: 'divider' }}>
				<Tooltip title="Every hatch counts as a catch. Stop hatching a pal once it has this many." placement="top">
					<TextField select size="small" label="Catches per pal" value={goal} onChange={(e) => changeGoal(Number(e.target.value))} sx={{ width: 150 }}>
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
									{s.round === 1 ? ': from My pals' : `: using round ${s.round - 1} hatches`}
								</Typography>
							)}
							<LazyItem estimate={53}>
								<StepRow step={s} />
							</LazyItem>
						</Fragment>
					))}
					{ladder.stuck.length > 0 && (
						<Box sx={{ p: 2 }}>
							<Typography variant="overline" color="text.secondary">
								Can't hatch from My pals ({ladder.stuck.length})
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
	)
}
