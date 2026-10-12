// XP ladder: hatching a pal counts as catching it, so breeding through the gaps in your Paldeck
// levels you without hunting. Starting from My pals, each round breeds every pal still short of
// the catch goal that its parents can make, and what hatches becomes a parent for the next round.
import { palIndex, pals, palCount, type Gender } from './gamedata'
import { parentsOf, type Pair } from './breeding'

export interface LadderStep {
	round: number
	child: string
	a: string
	b: string
	/** The gender each parent has to be; unset when either works */
	aGender?: Gender
	bGender?: Gender
	/** Hatches still needed to reach the catch goal */
	eggs: number
	/** Catches the child already has */
	caught: number
}

export interface Ladder {
	steps: LadderStep[]
	/** Pals short of the goal that nothing in reach can hatch */
	stuck: string[]
	rounds: number
	eggs: number
}

const opposite = (g: Gender): Gender => (g === 'M' ? 'F' : 'M')

/**
 * `owned`: your pals' species and genders; `catches`: Paldeck catches per pal id; `goal`: catches
 * to reach for each pal. Hatched pals can be either gender (keep hatching), so later rounds don't
 * need a specific one.
 */
export function buildLadder(owned: { palId: string; gender: Gender }[], catches: Record<string, number>, goal: number): Ladder {
	const count = (i: number) => catches[pals[i].id] ?? 0
	// Genders on hand for each pal, and the round it became available as a parent (0 = owned)
	const genders = Array.from({ length: palCount }, () => new Set<Gender>())
	const ready = new Int32Array(palCount).fill(-1)
	for (const o of owned) {
		let i: number
		try {
			i = palIndex(o.palId)
		} catch {
			continue
		}
		genders[i].add(o.gender)
		ready[i] = 0
	}
	const has = (i: number, g: Gender) => genders[i].has(g)

	/** The genders this pair needs, or null when your pals can't make it */
	const arrange = (p: Pair): { aGender?: Gender; bGender?: Gender } | null => {
		if (p.aGender && p.bGender) return has(p.a, p.aGender) && has(p.b, p.bGender) ? { aGender: p.aGender, bGender: p.bGender } : null
		if (p.a === p.b) return has(p.a, 'M') && has(p.a, 'F') ? { aGender: 'M', bGender: 'F' } : null
		for (const g of ['M', 'F'] as Gender[]) {
			if (has(p.a, g) && has(p.b, opposite(g))) {
				// Only name genders when one side is limited to one
				const free = genders[p.a].size === 2 && genders[p.b].size === 2
				return free ? {} : { aGender: g, bGender: opposite(g) }
			}
		}
		return null
	}

	const pending = new Set<number>()
	for (let i = 0; i < palCount; i++) if (count(i) < goal) pending.add(i)

	// Lower is better: parents available sooner, then not the pal itself, then parents you've
	// caught more of
	const score = (p: Pair, child: number) => [Math.max(ready[p.a], ready[p.b]), p.a === child || p.b === child ? 1 : 0, -Math.min(count(p.a), count(p.b))]
	const better = (x: number[], y: number[]) => {
		for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] < y[i]
		return false
	}

	const steps: LadderStep[] = []
	for (let round = 1; ; round++) {
		const found: { child: number; pair: Pair; genders: { aGender?: Gender; bGender?: Gender } }[] = []
		for (const child of pending) {
			let best: (typeof found)[number] | null = null
			let bestScore: number[] = []
			for (const p of parentsOf(child)) {
				if (ready[p.a] < 0 || ready[p.b] < 0 || ready[p.a] >= round || ready[p.b] >= round) continue
				const g = arrange(p)
				if (!g) continue
				const s = score(p, child)
				if (!best || better(s, bestScore)) {
					best = { child, pair: p, genders: g }
					bestScore = s
				}
			}
			if (best) found.push(best)
		}
		if (!found.length) break
		for (const { child, pair, genders: g } of found) {
			pending.delete(child)
			if (ready[child] < 0) {
				ready[child] = round
				genders[child].add('M').add('F')
			}
			steps.push({ round, child: pals[child].id, a: pals[pair.a].id, b: pals[pair.b].id, ...g, eggs: goal - count(child), caught: count(child) })
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
