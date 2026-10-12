// XP ladder: hatching a pal counts as catching it, so breeding through the gaps in your Paldeck
// levels you without hunting. Starting from the pals you've caught, each round breeds every
// missing pal its parents can make, and what hatches becomes a parent for the next round.
import { palIndex, pals, palCount, type Gender } from './gamedata'
import { parentsOf, type Pair } from './breeding'

export interface LadderStep {
	round: number
	child: string
	a: string
	b: string
	aGender?: Gender
	bGender?: Gender
	/** Hatches still needed to reach the catch goal */
	eggs: number
	/** Catches the child already has */
	caught: number
}

export interface Ladder {
	steps: LadderStep[]
	/** Pals short of the goal that nothing you have can hatch */
	stuck: string[]
	rounds: number
	eggs: number
}

/**
 * `catches`: Paldeck catches per pal id; `goal`: catches to reach for each pal. Pals already at
 * the goal are parents only; caught pals below it get topped up from round 1.
 */
export function buildLadder(catches: Record<string, number>, goal: number): Ladder {
	const count = (i: number) => catches[pals[i].id] ?? 0
	// The round each pal becomes available as a parent: 0 for caught pals
	const ready = new Int32Array(palCount).fill(-1)
	for (let i = 0; i < palCount; i++) if (count(i) > 0) ready[i] = 0

	const pending = new Set<number>()
	for (let i = 0; i < palCount; i++) if (count(i) < goal) pending.add(i)

	// Lower is better: parents available sooner, then not the pal itself (that needs a male and a
	// female of it), then parents you've caught more of
	const score = (p: Pair, child: number) => [
		Math.max(ready[p.a], ready[p.b]),
		p.a === child || p.b === child ? 1 : 0,
		-Math.min(count(p.a), count(p.b))
	]
	const better = (x: number[], y: number[]) => {
		for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] < y[i]
		return false
	}

	const steps: LadderStep[] = []
	let round = 0
	for (;;) {
		round++
		const found: { child: number; pair: Pair }[] = []
		for (const child of pending) {
			let best: Pair | null = null
			let bestScore: number[] = []
			for (const p of parentsOf(child)) {
				if (ready[p.a] < 0 || ready[p.b] < 0 || ready[p.a] >= round || ready[p.b] >= round) continue
				const s = score(p, child)
				if (!best || better(s, bestScore)) {
					best = p
					bestScore = s
				}
			}
			if (best) found.push({ child, pair: best })
		}
		if (!found.length) break
		for (const { child, pair } of found) {
			pending.delete(child)
			if (ready[child] < 0) ready[child] = round
			steps.push({
				round,
				child: pals[child].id,
				a: pals[pair.a].id,
				b: pals[pair.b].id,
				aGender: pair.aGender,
				bGender: pair.bGender,
				eggs: goal - count(child),
				caught: count(child)
			})
		}
	}

	steps.sort((x, y) => x.round - y.round || pals[palIndex(x.child)].breedingPower - pals[palIndex(y.child)].breedingPower)
	return {
		steps,
		stuck: [...pending].map((i) => pals[i].id),
		rounds: steps.length ? steps[steps.length - 1].round : 0,
		eggs: steps.reduce((sum, s) => sum + s.eggs, 0)
	}
}
