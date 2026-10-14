// Expeditions: what each one pays, how strong a team the game's auto-assign would send, and the
// reward rate that team earns. Built by `npm run expeditions` from palpedia.com (rewards) and
// paldb.cc (elements, item icons).
import raw from './expeditions.json'
import { getPal } from './gamedata'

export interface RewardOption {
	item: string
	min: number
	max: number
	/** Icon file name in public/items */
	icon?: string
}

export interface Expedition {
	name: string
	hard: boolean
	risk: string
	minutes: number
	/** Recommended firepower; the reward rate is 100% at exactly this */
	firepower: number
	require: { count: number; element: string } | null
	/** Each slot pays one of its options */
	rewards: RewardOption[][]
}

const data = raw as unknown as { source: string; expeditions: Expedition[]; elements: Record<string, string[]> }
export const expeditions = data.expeditions
export const EXPEDITION_SOURCE = data.source
export const palElements = (palId: string): string[] => data.elements[palId] ?? []

/** The pal stats the mod reports: level, IVs, condensation stars (0-4) and Pal Soul ranks */
export interface PalStats {
	level: number
	stars: number
	/** HP, attack, defense */
	ivs: [number, number, number]
	souls: [number, number, number]
}

/** Most pals an expedition takes */
export const TEAM_CAP = 100

/**
 * A pal's HP, attack and defense, by the community's reading of the game's formulas: base stat
 * scaled by level and IVs, then condensation (+5% a star) and Pal Souls (+3% a rank). Passives
 * don't count toward expedition firepower, so they're left out.
 */
export function combatStats(palId: string, s: PalStats) {
	const base = getPal(palId).stats
	const iv = (v: number) => 1 + v * 0.003
	const boost = (soul: number) => (1 + 0.05 * s.stars) * (1 + 0.03 * soul)
	return {
		hp: Math.floor(500 + 5 * s.level + base.hp * 0.5 * s.level * iv(s.ivs[0])) * boost(s.souls[0]),
		attack: Math.floor(100 + base.attack * 0.075 * s.level * iv(s.ivs[1])) * boost(s.souls[1]),
		defense: Math.floor(50 + base.defense * 0.075 * s.level * iv(s.ivs[2])) * boost(s.souls[2])
	}
}

/** One pal's expedition firepower: (attack + defense + HP / 5) x (1 + stars)^2 */
export function firepower(palId: string, s: PalStats): number {
	const c = combatStats(palId, s)
	return Math.round((c.attack + c.defense + c.hp / 5) * (1 + s.stars) ** 2)
}

export interface Candidate {
	key: string
	palId: string
	firepower: number
}

export interface Team {
	members: Candidate[]
	firepower: number
	/** Members of the required element */
	elementCount: number
	/** False when the Palbox doesn't have enough pals of the required element */
	meetsRequirement: boolean
}

/**
 * What the game's auto-assign sends, as best we can tell: the strongest pals of the required
 * element until the requirement is met, then the strongest of the rest up to the cap.
 */
export function autoAssign(candidates: Candidate[], e: Expedition): Team {
	const strongest = [...candidates].sort((a, b) => b.firepower - a.firepower)
	const isElement = (c: Candidate) => !!e.require && palElements(c.palId).includes(e.require.element)
	const members: Candidate[] = []
	if (e.require) members.push(...strongest.filter(isElement).slice(0, e.require.count))
	const picked = new Set(members.map((m) => m.key))
	for (const c of strongest) {
		if (members.length >= TEAM_CAP) break
		if (!picked.has(c.key)) members.push(c)
	}
	const elementCount = members.filter(isElement).length
	return {
		members,
		firepower: members.reduce((sum, m) => sum + m.firepower, 0),
		elementCount,
		meetsRequirement: !e.require || elementCount >= e.require.count
	}
}

// Reward rate by team firepower over the recommended amount, from the game's curve
// (C_CharacterTeamMission_TimeRateByStrengthRate, as read by palpedia.com); linear below 1x
const CURVE: [number, number][] = [
	[1, 100],
	[1.5, 122],
	[2, 149],
	[3, 219],
	[4, 306],
	[5, 400],
	[6, 508],
	[8, 790],
	[10, 1000]
]

/** Reward percent for a team; `labBonus` is the Pal Labor Research bonus in percent (up to 35) */
export function rewardRate(teamFirepower: number, recommended: number, labBonus = 0): number {
	const ratio = teamFirepower / recommended
	let rate: number
	if (ratio <= 1) rate = ratio * 100
	else if (ratio >= 10) rate = 1000
	else {
		const i = CURVE.findIndex(([r]) => r >= ratio)
		const [r0, v0] = CURVE[i - 1]
		const [r1, v1] = CURVE[i]
		rate = v0 + ((ratio - r0) / (r1 - r0)) * (v1 - v0)
	}
	return rate * (1 + labBonus / 100)
}

/** An option's payout at a reward rate */
export const payout = (o: RewardOption, rate: number) => ({ min: Math.floor((o.min * rate) / 100), max: Math.floor((o.max * rate) / 100) })
