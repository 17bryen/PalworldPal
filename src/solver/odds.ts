import { gameData } from '../data/gamedata'

export const MAX_PASSIVES = 4

function normalize(weights: Record<number, number>, from: number, to: number): number[] {
	const total = Object.values(weights).reduce((sum, w) => sum + w, 0)
	const out: number[] = []
	for (let k = from; k <= to; k++) out[k] = (weights[k] ?? 0) / total
	return out
}

/** Chance the game picks c passives from the parents' combined pool (before capping at the pool size) */
const inheritCount = normalize(gameData.passiveInheritanceWeights, 0, MAX_PASSIVES)
/** Chance the game then adds r random passives (capped by free slots) */
const randomCount = normalize(gameData.passiveRandomWeights, 0, MAX_PASSIVES)

export interface YakumoOutcome {
	/** Yakumo passives that landed on the caught pal */
	landed: string[]
	/** Passives the wild pal rolled on its own */
	own: number
	chance: number
}

/**
 * Passives a pal caught with Yakumo summoned ends up with. The wild pal's own passives come
 * first (assumed to follow the egg random-passive weights), then each Yakumo passive rolls in
 * slot order and fills a free slot on success.
 */
export function yakumoOutcomes(passives: string[], perPassive: number): YakumoOutcome[] {
	const out: YakumoOutcome[] = []
	for (let own = 0; own < MAX_PASSIVES; own++) {
		if (!randomCount[own]) continue
		for (let rolls = 0; rolls < 1 << passives.length; rolls++) {
			let chance = randomCount[own]
			const landed: string[] = []
			passives.forEach((name, i) => {
				const hit = (rolls >> i) & 1
				chance *= hit ? perPassive : 1 - perPassive
				if (hit && own + landed.length < MAX_PASSIVES) landed.push(name)
			})
			out.push({ landed, own, chance })
		}
	}
	return out
}

function binom(n: number, k: number): number {
	if (k < 0 || k > n) return 0
	let r = 1
	for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i
	return r
}

/** Chance exactly `count` passives are inherited from a pool of `pool` distinct passives */
function inheritedExactly(count: number, pool: number): number {
	if (pool === 0) return count === 0 ? 1 : 0
	let p = 0
	for (let c = 1; c <= MAX_PASSIVES; c++) if (Math.min(c, pool) === count) p += inheritCount[c]
	return p
}

/**
 * Chance an egg carries all `wanted` passives from a pool of `pool` distinct passives (wanted
 * ones included) and at most `maxOther` passives that aren't wanted, inherited or random.
 */
export function childChance(wanted: number, pool: number, maxOther: number): number {
	let total = 0
	for (let extra = 0; wanted + extra <= Math.min(pool, MAX_PASSIVES); extra++) {
		const count = wanted + extra
		// The wanted passives must be among the `count` picked out of the pool
		const pick = inheritedExactly(count, pool) * (binom(pool - wanted, extra) / binom(pool, count))
		if (pick === 0) continue
		const room = MAX_PASSIVES - count
		for (let r = 0; r <= MAX_PASSIVES; r++) {
			if (!randomCount[r]) continue
			if (extra + Math.min(r, room) <= maxOther) total += pick * randomCount[r]
		}
	}
	return total
}
