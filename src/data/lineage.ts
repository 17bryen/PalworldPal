import { gameData, pals, palCount } from './gamedata'

/** Every pairing that produces each pal, as [parentA, parentB] index pairs */
export const parentPairs: [number, number][][] = Array.from({ length: palCount }, () => [])
for (let a = 0; a < palCount; a++) {
	for (let b = a; b < palCount; b++) {
		const c = gameData.children[a * palCount + b]
		if (c >= 0) parentPairs[c].push([a, b])
	}
}
for (const rule of gameData.genderRules) parentPairs[rule.child].push([rule.a, rule.b])

/** Pals that can only be bred from themselves or legendary pals */
export const legendaryLine = new Set(
	pals
		.filter((_, c) => parentPairs[c].every(([a, b]) => [a, b].every((p) => p === c || pals[p].legendary)))
		.map((p) => p.id)
)
