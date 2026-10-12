// Breeding lookups for the calculator and the XP ladder, from the game's full pair table
import { gameData, pals, palCount, type Gender, type PalInfo } from './gamedata'

export interface Pair {
	a: number
	b: number
	/** Set when the child depends on which parent is male */
	aGender?: Gender
	bGender?: Gender
}

let byChild: Pair[][] | null = null

/** Every pair that hatches each pal, built on first use */
function pairsByChild(): Pair[][] {
	if (byChild) return byChild
	byChild = Array.from({ length: palCount }, () => [])
	for (let a = 0; a < palCount; a++) {
		for (let b = a; b < palCount; b++) {
			const c = gameData.children[a * palCount + b]
			if (c >= 0) byChild[c].push({ a, b })
		}
	}
	for (const r of gameData.genderRules) byChild[r.child].push({ a: r.a, b: r.b, aGender: r.aGender, bGender: r.bGender })
	return byChild
}

export const parentsOf = (child: number): Pair[] => pairsByChild()[child]

/** What two pals hatch: one child, or one per gender arrangement when that decides it */
export function childrenOf(a: number, b: number): { child: number; aGender?: Gender; bGender?: Gender }[] {
	const c = gameData.children[a * palCount + b]
	if (c >= 0) return [{ child: c }]
	return gameData.genderRules
		.filter((r) => (r.a === a && r.b === b) || (r.a === b && r.b === a))
		.map((r) => (r.a === a ? { child: r.child, aGender: r.aGender, bGender: r.bGender } : { child: r.child, aGender: r.bGender, bGender: r.aGender }))
}

/** The number the game looks for: the parents' average, halves rounded up */
export const breedingTarget = (a: PalInfo, b: PalInfo) => Math.floor((a.breedingPower + b.breedingPower + 1) / 2)

/** Pals only one specific pair (or themselves) can hatch, so the average never lands on them */
export const isSpecialResult = (child: number) => parentsOf(child).filter((p) => p.a !== p.b).length <= 4

export const palAt = (i: number) => pals[i]
