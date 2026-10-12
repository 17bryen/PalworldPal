import { pals, palCount, palIndex, gameData, getPassive, YAKUMO_ID, YAKUMO_CHANCE, type Gender } from '../data/gamedata'
import { spawnRegions, worldTree } from '../data/regions'
import { implantable } from '../data/surgery'
import { childChance, yakumoOutcomes, MAX_PASSIVES } from './odds'
import {
	MAX_GENERATIONS,
	type CatchItem,
	type OwnedPal,
	type Pin,
	type Plan,
	type PlanNode,
	type PlanSettings,
	type PlanStep,
	type SolveProgress,
	type TargetResult,
	type WantedPal
} from './types'

/**
 * How a pal's gender works out when pairing it:
 * MALE / FEMALE - a specific pal you have; its gender is fixed
 * FREE - a catch; you pick whichever gender the pairing needs
 * RANDOM - bred; getting a specific gender costs extra eggs
 */
const MALE = 0
const FEMALE = 1
const FREE = 2
const RANDOM = 3
type Kind = 0 | 1 | 2 | 3

/** Extra minutes to catch a pal that lives only in the late-game World Tree */
const WORLD_TREE_MINUTES = 10
/** Paths needing more eggs than this for one step are not worth suggesting */
const MAX_EGGS_PER_STEP = 500
/** Yakumo catches needing more tries than this are not worth suggesting */
const MAX_YAKUMO_CATCHES = 60
/** States kept per pal in each pass when passives are wanted */
const CAPS = [3, 6, 12]

/**
 * For each count of free passive slots, the limits on unwanted passives a kept egg may have:
 * clean, one or two extras, or whatever the first egg brings
 */
const OTHER_OPTIONS = Array.from({ length: MAX_PASSIVES + 1 }, (_, room) => [...new Set([0, 1, 2, room])].filter((o) => o <= room))

// Every pairing the game allows. A gender of -1 means the child is the same either way and the
// parents just need opposite genders.
const pairA: number[] = []
const pairB: number[] = []
const pairC: number[] = []
const pairGA: number[] = []
const pairGB: number[] = []
const pairsByChild: number[][] = Array.from({ length: palCount }, () => [])

function addPair(a: number, b: number, c: number, ga: number, gb: number) {
	pairsByChild[c].push(pairA.length)
	pairA.push(a)
	pairB.push(b)
	pairC.push(c)
	pairGA.push(ga)
	pairGB.push(gb)
}
for (let a = 0; a < palCount; a++) {
	for (let b = a; b < palCount; b++) {
		const c = gameData.children[a * palCount + b]
		if (c >= 0) addPair(a, b, c, -1, -1)
	}
}
for (const r of gameData.genderRules) addPair(r.a, r.b, r.child, r.aGender === 'M' ? MALE : FEMALE, r.bGender === 'M' ? MALE : FEMALE)

/** A pal available before the search starts: owned, or already in another wanted pal's tree */
interface Instance {
	pal: number
	kind: Kind
	passives: string[]
	other: number
	/** For bred pals: eggs per kept egg, which getting a specific gender multiplies */
	eggs: number
	ref: { kind: 'owned'; uid: string } | { kind: 'node'; node: PlanNode }
}

interface Yakumo {
	uid: string
	passives: string[]
	chance: number
}

type StateSource =
	| { t: 'instance'; inst: Instance }
	| { t: 'catch'; minutes: number; yakumo?: { uid: string; catches: number } }
	| { t: 'bred'; a: State; b: State; eggs: number; factorA: number; factorB: number; forceA: Gender | null; forceB: Gender | null; match: boolean }

interface State {
	pal: number
	kind: Kind
	/** Bit i set when the pal carries wanted passive i */
	mask: number
	/** Passives that aren't wanted (upper bound) */
	other: number
	/** For RANDOM pals: eggs per kept egg in the step that makes it */
	eggs: number
	cost: number
	gen: number
	/** Search level that created this state; pairs of older states were already tried */
	born: number
	src: StateSource
}

function popcount(x: number): number {
	let c = 0
	for (; x; x &= x - 1) c++
	return c
}

function kindCovers(t: Kind, s: Kind): boolean {
	return t === s || t === FREE
}

/**
 * Keeps only states no other state beats on gender flexibility, passives, junk and cost, sorted
 * by cost. Past `cap` states, drops the one with the fewest wanted passives, then the most junk,
 * then the highest cost.
 */
function insert(front: State[], s: State, cap = Infinity): void {
	for (const t of front) {
		if (kindCovers(t.kind, s.kind) && (t.mask & s.mask) === s.mask && t.other <= s.other && t.cost <= s.cost && t.eggs <= s.eggs) return
	}
	for (let i = front.length - 1; i >= 0; i--) {
		const t = front[i]
		if (kindCovers(s.kind, t.kind) && (s.mask & t.mask) === t.mask && s.other <= t.other && s.cost <= t.cost && s.eggs <= t.eggs) front.splice(i, 1)
	}
	let at = front.length
	while (at > 0 && front[at - 1].cost > s.cost) at--
	front.splice(at, 0, s)
	if (front.length > cap) {
		let worst = 0
		for (let i = 1; i < front.length; i++) if (worse(front[i], front[worst])) worst = i
		front.splice(worst, 1)
	}
}

function worse(a: State, b: State): boolean {
	const ka = popcount(a.mask)
	const kb = popcount(b.mask)
	if (ka !== kb) return ka < kb
	if (a.other !== b.other) return a.other > b.other
	return a.cost > b.cost
}

/** childChance for every (wanted, pool, maxOther); pools never exceed two full pals */
const MAX_POOL = MAX_PASSIVES * 2
const chanceTable = new Float64Array((MAX_PASSIVES + 1) * (MAX_POOL + 1) * (MAX_PASSIVES + 1))
for (let k = 0; k <= MAX_PASSIVES; k++)
	for (let pool = k; pool <= MAX_POOL; pool++)
		for (let o = 0; o <= MAX_PASSIVES; o++) chanceTable[(k * (MAX_POOL + 1) + pool) * (MAX_PASSIVES + 1) + o] = childChance(k, pool, o)

function chance(wanted: number, pool: number, maxOther: number): number {
	return chanceTable[(wanted * (MAX_POOL + 1) + Math.min(pool, MAX_POOL)) * (MAX_PASSIVES + 1) + maxOther]
}

const genderOf = (k: Kind): Gender | null => (k === MALE ? 'M' : k === FEMALE ? 'F' : null)
const opposite = (g: Gender): Gender => (g === 'M' ? 'F' : 'M')
const genderChance = (pal: number, g: Gender) => (g === 'M' ? pals[pal].maleChance : 1 - pals[pal].maleChance)

interface Pairing {
	/** Egg multipliers on each parent's own step, to get the gender this pairing needs */
	factorA: number
	factorB: number
	forceA: Gender | null
	forceB: Gender | null
	/** Both parents are bred; the cheaper one to re-breed adapts to the other */
	match: boolean
}

/** How two parents can pair given their genders, or null when they can't */
function pairing(sa: State, sb: State, ga: number, gb: number): Pairing | null {
	const p: Pairing = { factorA: 1, factorB: 1, forceA: null, forceB: null, match: false }
	const fixedA = sa.kind === MALE || sa.kind === FEMALE
	const fixedB = sb.kind === MALE || sb.kind === FEMALE

	// Each side that must be a specific gender
	const force = (s: State, g: Gender, side: 'A' | 'B'): boolean => {
		if (s.kind === MALE || s.kind === FEMALE) return genderOf(s.kind) === g
		const factor = s.kind === RANDOM ? 1 / genderChance(s.pal, g) : 1
		if (!isFinite(factor)) return false
		if (side === 'A') {
			p.forceA = g
			p.factorA = factor
		} else {
			p.forceB = g
			p.factorB = factor
		}
		return true
	}

	if (ga >= 0) {
		// The child depends on which parent is which gender
		return force(sa, ga === MALE ? 'M' : 'F', 'A') && force(sb, gb === MALE ? 'M' : 'F', 'B') ? p : null
	}
	if (fixedA && fixedB) return sa.kind !== sb.kind ? p : null
	if (fixedA) return force(sb, opposite(genderOf(sa.kind)!), 'B') ? p : null
	if (fixedB) return force(sa, opposite(genderOf(sb.kind)!), 'A') ? p : null
	if (sa.kind === RANDOM && sb.kind === RANDOM) {
		// Expected re-breeding for one side to come out opposite to the other
		const adapt = (self: State, other: State) =>
			genderChance(other.pal, 'M') / genderChance(self.pal, 'F') + genderChance(other.pal, 'F') / genderChance(self.pal, 'M')
		const fa = adapt(sa, sb)
		const fb = adapt(sb, sa)
		if (!isFinite(fa) && !isFinite(fb)) return null
		if (sa.eggs * (fa - 1) <= sb.eggs * (fb - 1)) p.factorA = fa
		else p.factorB = fb
		p.match = true
	}
	// A catch takes whichever gender the other parent needs
	return p
}

/** Rough minutes to find and catch a pal under the player's settings, or null when it isn't catchable */
export function catchMinutes(pal: number, s: PlanSettings, isTarget: boolean, ignoreLimits = false): number | null {
	const p = pals[pal]
	const regions = spawnRegions(p.id)
	if (!regions.length) return null
	const minutes = p.catchMinutes + (worldTree.get(p.id) === 'only' ? WORLD_TREE_MINUTES : 0)
	if (ignoreLimits) return minutes
	if (!s.allowCatching) return null
	if (!regions.some((r) => !s.disabledRegions.includes(r))) return null
	const pref = s.catchPrefs[p.id]
	if (pref === 'never') return null
	// A legendary on the wanted list may still be caught directly
	if (p.legendary && !s.allowLegendaryCatches && !isTarget) return null
	if (pref === 'easy') return 1
	if (pref === 'hard') return minutes * 3
	return minutes
}

interface SolverOptions {
	settings: PlanSettings
	instances: Instance[]
	yakumos: Yakumo[]
}

class TargetSolver {
	constructor(private o: SolverOptions) {}

	catchMinutes(pal: number, isTarget: boolean, ignoreLimits = false): number | null {
		return catchMinutes(pal, this.o.settings, isTarget, ignoreLimits)
	}

	/** Fewest generations from each pal to the target, ignoring passives and gender */
	distances(target: number, limit: number): Int8Array {
		const dist = new Int8Array(palCount).fill(127)
		dist[target] = 0
		let frontier = [target]
		for (let d = 1; d <= limit && frontier.length; d++) {
			const next: number[] = []
			for (const c of frontier) {
				for (const i of pairsByChild[c]) {
					for (const p of [pairA[i], pairB[i]]) {
						if (dist[p] > d) {
							dist[p] = d
							next.push(p)
						}
					}
				}
			}
			frontier = next
		}
		return dist
	}

	/**
	 * Best way to get the target, or null when it can't be reached. Wanted passives multiply the
	 * states to search, so passes keep a few states per pal first and use the best plan found so
	 * far to skip anything that can't beat it.
	 */
	/** `overwrite`: unwanted passives the result may carry because Surgery Table implants replace them */
	best(target: number, wanted: string[], strict: boolean, quick = false, overwrite = 0): State | null {
		if (!wanted.length) return pickBest(this.solve(target, wanted), strict, overwrite)
		let best: State | null = null
		for (const cap of quick ? [CAPS[0]] : CAPS) {
			const ideal = best && popcount(best.mask) === wanted.length && !(strict && best.other > overwrite)
			const found = this.solve(target, wanted, cap, ideal ? best!.cost : Infinity)
			best = pickBest(best ? [...found, best] : found, strict, overwrite)
		}
		return best
	}

	solve(target: number, wanted: string[], cap = Infinity, bound = Infinity): State[] {
		const { settings, instances } = this.o
		const maxGen = settings.maxGenerations
		const minutesPerEgg = settings.minutesPerEgg
		const dist = this.distances(target, maxGen)
		const bit = (name: string) => wanted.indexOf(name)
		const maskOf = (names: string[]) => names.reduce((m, n) => (bit(n) >= 0 ? m | (1 << bit(n)) : m), 0)
		const pins = this.pinsFor(bit, maskOf)
		const pinAllows = (c: number, mask: number, a: number, b: number) => {
			const pin = pins.get(c)?.get(mask)
			if (!pin) return true
			if (pin.kind === 'catch') return false
			const ia = pals[a].id
			const ib = pals[b].id
			return (pin.a === ia && pin.b === ib) || (pin.a === ib && pin.b === ia)
		}

		let fronts: State[][] = Array.from({ length: palCount }, () => [])
		for (const inst of instances) {
			if (dist[inst.pal] > maxGen) continue
			let other = inst.other
			for (const name of inst.passives) if (bit(name) < 0) other++
			insert(
				fronts[inst.pal],
				{ pal: inst.pal, kind: inst.kind, mask: maskOf(inst.passives), other, eggs: inst.eggs, cost: 0, gen: 0, born: 0, src: { t: 'instance', inst } },
				cap
			)
		}

		const yakumoOptions = this.yakumoOptions(wanted, maskOf)
		for (let pal = 0; pal < palCount; pal++) {
			if (dist[pal] > maxGen) continue
			const minutes = this.catchMinutes(pal, pal === target)
			if (minutes == null) continue
			const leaf = (mask: number, other: number, cost: number, yakumo?: { uid: string; catches: number }) =>
				insert(fronts[pal], { pal, kind: FREE, mask, other, eggs: 0, cost, gen: 0, born: 0, src: { t: 'catch', minutes: cost, yakumo } }, cap)
			// A pinned pair means the player wants that pal bred, not caught
			const catchable = (mask: number) => pins.get(pal)?.get(mask)?.kind !== 'pair'
			if (catchable(0)) leaf(0, 0, minutes)
			// Repeat catches of a pal you've already found go faster than the first
			for (const y of yakumoOptions) {
				if (catchable(y.mask)) leaf(y.mask, y.other, minutes + (y.catches - 1) * Math.max(1, minutes / 4), { uid: y.uid, catches: y.catches })
			}
		}

		for (let level = 1; level <= maxGen; level++) {
			const next = fronts.map((f) => f.slice())
			for (let i = 0; i < pairC.length; i++) {
				const c = pairC[i]
				if (dist[c] > maxGen - level) continue
				const fa = fronts[pairA[i]]
				const fb = fronts[pairB[i]]
				if (!fa.length || !fb.length) continue
				// Each remaining generation costs at least one egg
				const minRest = (1 + dist[c]) * minutesPerEgg
				for (const sa of fa) {
					if (sa.cost + fb[0].cost + minRest > bound) break
					const aNew = sa.born === level - 1
					for (const sb of fb) {
						const base = sa.cost + sb.cost
						if (base + minRest > bound) break
						if (!aNew && sb.born !== level - 1) continue
						const mask = sa.mask | sb.mask
						if (!pinAllows(c, mask, pairA[i], pairB[i])) continue
						const pair = pairing(sa, sb, pairGA[i], pairGB[i])
						if (!pair) continue
						const genderCost = (sa.eggs * (pair.factorA - 1) + sb.eggs * (pair.factorB - 1)) * minutesPerEgg
						const k = popcount(mask)
						const pool = k + sa.other + sb.other
						const gen = 1 + Math.max(sa.gen, sb.gen)
						for (const maxOther of OTHER_OPTIONS[MAX_PASSIVES - k]) {
							const pPassives = chance(k, pool, maxOther)
							if (pPassives <= 0) continue
							const eggs = 1 / pPassives
							if (eggs > MAX_EGGS_PER_STEP) continue
							const cost = base + genderCost + eggs * minutesPerEgg
							if (cost + dist[c] * minutesPerEgg > bound) continue
							insert(
								next[c],
								{ pal: c, kind: RANDOM, mask, other: maxOther, eggs, cost, gen, born: level, src: { t: 'bred', a: sa, b: sb, eggs, ...pair } },
								cap
							)
						}
					}
				}
			}
			fronts = next
		}
		return fronts[target]
	}

	/** Pins that apply to this search, by pal and then by the wanted passives the pal carries */
	pinsFor(bit: (name: string) => number, maskOf: (names: string[]) => number) {
		const pins = new Map<number, Map<number, Pin>>()
		for (const [key, pin] of Object.entries(this.o.settings.pins)) {
			const [palId, list] = key.split('|')
			const names = list ? list.split(',') : []
			if (names.some((n) => bit(n) < 0)) continue
			let pal: number
			try {
				pal = palIndex(palId)
			} catch {
				continue
			}
			if (!pins.has(pal)) pins.set(pal, new Map())
			pins.get(pal)!.set(maskOf(names), pin)
		}
		return pins
	}

	/** Catch options with each owned Yakumo summoned: which wanted passives, how much junk, how many tries */
	yakumoOptions(wanted: string[], maskOf: (names: string[]) => number) {
		const options: { uid: string; mask: number; other: number; catches: number }[] = []
		if (!wanted.length) return options
		for (const y of this.o.yakumos) {
			const outcomes = yakumoOutcomes(y.passives, y.chance).map((o) => ({
				mask: maskOf(o.landed),
				other: o.own + o.landed.filter((n) => !wanted.includes(n)).length,
				chance: o.chance
			}))
			const full = maskOf(y.passives)
			for (let mask = full; mask; mask = (mask - 1) & full) {
				for (const maxOther of [0, 1]) {
					const p = outcomes.filter((o) => (o.mask & mask) === mask && o.other <= maxOther).reduce((sum, o) => sum + o.chance, 0)
					if (p > 0 && 1 / p <= MAX_YAKUMO_CATCHES) options.push({ uid: y.uid, mask, other: maxOther, catches: 1 / p })
				}
			}
		}
		return options
	}

	/** First generation at which the target can exist, ignoring passives; Infinity if never */
	reachable(target: number, mode: 'settings' | 'all' | 'noLegendLimit'): number {
		const have = new Uint8Array(palCount * 2)
		for (const inst of this.o.instances) {
			if (inst.kind === MALE || inst.kind === FEMALE) have[inst.pal * 2 + inst.kind] = 1
			else have[inst.pal * 2] = have[inst.pal * 2 + 1] = 1
		}
		const s = this.o.settings
		for (let pal = 0; pal < palCount; pal++) {
			let minutes: number | null
			if (mode === 'all') minutes = this.catchMinutes(pal, true, true)
			else if (mode === 'noLegendLimit') minutes = s.allowCatching ? this.catchMinutes(pal, true) : null
			else minutes = this.catchMinutes(pal, pal === target)
			if (minutes != null) have[pal * 2] = have[pal * 2 + 1] = 1
		}
		if (have[target * 2] || have[target * 2 + 1]) return 0
		for (let level = 1; level <= MAX_GENERATIONS; level++) {
			const snap = have.slice()
			for (let i = 0; i < pairC.length; i++) {
				const a = pairA[i] * 2
				const b = pairB[i] * 2
				const ok =
					pairGA[i] >= 0 ? snap[a + pairGA[i]] && snap[b + pairGB[i]] : (snap[a] && snap[b + 1]) || (snap[a + 1] && snap[b])
				if (ok) have[pairC[i] * 2] = have[pairC[i] * 2 + 1] = 1
			}
			if (have[target * 2]) return level
		}
		return Infinity
	}

	explainUnreachable(target: number): string {
		const p = pals[target]
		const s = this.o.settings
		const bredFromOthers = pairsByChild[target].some((i) => pairA[i] !== target || pairB[i] !== target)
		if (!bredFromOthers) {
			if (this.catchMinutes(target, true, true) == null) return 'Can\'t be bred from other pals or caught in the wild.'
			if (!s.allowCatching) return 'Can only be caught. Turn on catching to plan it.'
			if (s.catchPrefs[p.id] === 'never') return 'Can only be caught, and it\'s marked as never catch.'
			return 'Can only be caught, and none of its spawn regions are turned on.'
		}
		const withSettings = this.reachable(target, 'settings')
		if (withSettings <= MAX_GENERATIONS) {
			if (withSettings > s.maxGenerations) return `Needs ${withSettings} generations; the limit is ${s.maxGenerations}.`
			if (Object.keys(s.pins).length) return 'Your chosen pairs leave no path within the limits.'
			return 'Every path needs more than 500 eggs for one step.'
		}
		if (this.reachable(target, 'all') <= MAX_GENERATIONS) {
			if (!s.allowCatching) return 'Needs pals you don\'t own. Turn on catching to plan it.'
			if (!s.allowLegendaryCatches && this.reachable(target, 'noLegendLimit') <= MAX_GENERATIONS) return 'Needs a legendary catch.'
			return 'Needs a pal you can\'t catch with your map access or catch settings.'
		}
		return `Can't be reached from your pals within ${MAX_GENERATIONS} generations.`
	}
}

/** Most wanted passives first, then clean (when required), then cheapest, then shallowest */
function pickBest(states: State[], strict: boolean, overwrite = 0): State | null {
	let best: State | null = null
	let bestKey: number[] = []
	for (const s of states) {
		const key = [-popcount(s.mask), strict && s.other > overwrite ? 1 : 0, s.cost, s.gen]
		if (!best || lexLess(key, bestKey)) {
			best = s
			bestKey = key
		}
	}
	return best
}

function lexLess(a: number[], b: number[]): boolean {
	for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i]
	return false
}

const sortedKey = (names: string[]) => [...names].sort().join(',')

/** Turns a search result into a self-contained tree */
function buildTree(s: State, wanted: string[], gender: Gender | null, eggFactor: number): PlanNode {
	const palId = pals[s.pal].id
	const passives = wanted.filter((_, i) => s.mask & (1 << i))
	const src = s.src
	if (src.t === 'instance') {
		if (src.inst.ref.kind === 'owned') {
			return { key: `o:${src.inst.ref.uid}`, palId, gender: genderOf(s.kind), passives, source: { kind: 'owned', ownedUid: src.inst.ref.uid } }
		}
		return src.inst.ref.node
	}
	if (src.t === 'catch') {
		const yakumo = src.yakumo ? { ownedUid: src.yakumo.uid, catches: src.yakumo.catches } : undefined
		return {
			key: `c:${palId}:${gender ?? ''}:${yakumo?.ownedUid ?? ''}:${sortedKey(passives)}`,
			palId,
			gender,
			passives,
			source: { kind: 'catch', minutes: src.minutes, yakumo }
		}
	}
	const parents: [PlanNode, PlanNode] = [buildTree(src.a, wanted, src.forceA, src.factorA), buildTree(src.b, wanted, src.forceB, src.factorB)]
	return {
		key: `b:${palId}:${gender ?? ''}:${sortedKey(passives)}`,
		palId,
		gender,
		passives,
		source: { kind: 'bred', eggs: src.eggs * eggFactor },
		parents,
		matchGenders: src.match || undefined
	}
}

/** Every bred or caught node in a tree, so other wanted pals can reuse them */
function treeInstances(tree: PlanNode, out: Instance[] = []): Instance[] {
	if (tree.source.kind === 'owned') return out
	const kind: Kind = tree.gender ? (tree.gender === 'M' ? MALE : FEMALE) : tree.source.kind === 'catch' ? FREE : RANDOM
	out.push({
		pal: palIndex(tree.palId),
		kind,
		passives: tree.passives,
		other: 0,
		eggs: tree.source.kind === 'bred' ? tree.source.eggs : 0,
		ref: { kind: 'node', node: tree }
	})
	tree.parents?.forEach((p) => treeInstances(p, out))
	return out
}

function nodeMinutes(node: PlanNode, minutesPerEgg: number): number {
	if (node.source.kind === 'bred') return node.source.eggs * minutesPerEgg
	if (node.source.kind === 'catch') return node.source.minutes
	return 0
}

/** Effort for everything in one tree, counting a shared pal once */
function treeMinutes(tree: PlanNode, minutesPerEgg: number): number {
	const seen = new Set<string>()
	const walk = (n: PlanNode): number => {
		if (seen.has(n.key)) return 0
		seen.add(n.key)
		return nodeMinutes(n, minutesPerEgg) + (n.parents ? walk(n.parents[0]) + walk(n.parents[1]) : 0)
	}
	return walk(tree)
}

function treeDepth(node: PlanNode): number {
	return node.parents ? 1 + Math.max(treeDepth(node.parents[0]), treeDepth(node.parents[1])) : 0
}

export function solvePlan(owned: OwnedPal[], wanted: WantedPal[], settings: PlanSettings, onProgress?: (p: SolveProgress) => void): Plan {
	const ownedInstances: Instance[] = owned.map((o) => ({
		pal: palIndex(o.palId),
		kind: o.gender === 'M' ? MALE : FEMALE,
		passives: o.passives,
		other: 0,
		eggs: 0,
		ref: { kind: 'owned', uid: o.uid }
	}))
	const yakumos: Yakumo[] = owned
		.filter((o) => o.palId === YAKUMO_ID)
		.map((o) => ({
			uid: o.uid,
			passives: o.passives.filter((n) => getPassive(n)?.copyable !== false),
			chance: YAKUMO_CHANCE[Math.max(0, Math.min(4, o.stars ?? 0))]
		}))
		.filter((y) => y.passives.length)

	// Passives the Surgery Table can add are implanted afterwards; only the rest are bred for
	const surgery = implantable(settings.surgery)
	const targets = wanted.map((w) => {
		const all = [...new Set(w.passives)].slice(0, MAX_PASSIVES)
		return { w, pal: palIndex(w.palId), passives: all.filter((p) => !surgery.has(p)), implants: all.filter((p) => surgery.has(p)) }
	})
	const strict = (t: (typeof targets)[number]) => settings.onlyWantedPassives && t.passives.length + t.implants.length > 0
	const rounds = targets.length > 1 ? 2 : 1
	const total = targets.length * rounds
	let done = 0
	const report = (label: string) => onProgress?.({ done, total, label })

	const best = new Map<string, State | null>()
	const trees = new Map<string, PlanNode>()
	const solvers = new Map<string, TargetSolver>()
	const plan = (t: (typeof targets)[number], instances: Instance[], quick: boolean) => {
		const solver = new TargetSolver({ settings, instances, yakumos })
		// An implant can overwrite an unwanted passive, so that many extras don't need breeding out
		const s = solver.best(t.pal, t.passives, strict(t), quick, t.implants.length)
		best.set(t.w.uid, s)
		solvers.set(t.w.uid, solver)
		if (s) trees.set(t.w.uid, buildTree(s, t.passives, null, 1))
		else trees.delete(t.w.uid)
		done++
	}

	// Round 1: each wanted pal on its own (a quick pass when a second round follows)
	for (const t of targets) {
		report(`Planning ${pals[t.pal].name}`)
		plan(t, ownedInstances, rounds > 1)
	}

	// Round 2: re-plan each with everything the others make treated as free, so paths that
	// share pals win. Disabled pals take part, so enabled ones lean toward what they'd share.
	if (rounds > 1) {
		const order = [...targets].sort((x, y) => (best.get(x.w.uid)?.cost ?? Infinity) - (best.get(y.w.uid)?.cost ?? Infinity))
		for (const t of order) {
			report(`Sharing steps for ${pals[t.pal].name}`)
			const shared = [...trees.entries()].filter(([uid]) => uid !== t.w.uid).flatMap(([, tree]) => treeInstances(tree))
			plan(t, [...ownedInstances, ...shared], false)
		}
	}

	// One node per key across all trees; the first tree to use a key decides its parents
	const enabled = targets.filter((t) => !t.w.disabled)
	const disabled = targets.filter((t) => t.w.disabled)
	const canonical = new Map<string, PlanNode>()
	const canon = (node: PlanNode): PlanNode => {
		const seen = canonical.get(node.key)
		if (seen) return seen
		const copy: PlanNode = { ...node, source: { ...node.source }, parents: node.parents && [canon(node.parents[0]), canon(node.parents[1])] }
		canonical.set(node.key, copy)
		return copy
	}
	for (const t of [...enabled, ...disabled]) {
		const tree = trees.get(t.w.uid)
		if (tree) trees.set(t.w.uid, canon(tree))
	}

	// Steps in breeding order, for enabled wanted pals only
	const steps: PlanStep[] = []
	const stepByKey = new Map<string, PlanStep>()
	const catchByKey = new Map<string, CatchItem>()
	const counted = new Set<string>()
	let totalMinutes = 0
	const walk = (node: PlanNode, uid: string) => {
		node.parents?.forEach((p) => walk(p, uid))
		if (!counted.has(node.key)) {
			counted.add(node.key)
			totalMinutes += nodeMinutes(node, settings.minutesPerEgg)
		}
		if (node.source.kind === 'bred') {
			let step = stepByKey.get(node.key)
			if (!step) {
				step = { id: steps.length + 1, node, forWanted: [] }
				node.source.stepId = step.id
				steps.push(step)
				stepByKey.set(node.key, step)
			}
			if (!step.forWanted.includes(uid)) step.forWanted.push(uid)
		} else if (node.source.kind === 'catch') {
			let item = catchByKey.get(node.key)
			if (!item) {
				item = { key: node.key, palId: node.palId, gender: node.gender, passives: node.passives, minutes: node.source.minutes, yakumo: node.source.yakumo, forWanted: [] }
				catchByKey.set(node.key, item)
			}
			if (!item.forWanted.includes(uid)) item.forWanted.push(uid)
		}
	}
	for (const t of enabled) {
		const tree = trees.get(t.w.uid)
		if (tree) walk(tree, t.w.uid)
	}

	const results: TargetResult[] = targets.map((t) => {
		const s = best.get(t.w.uid)
		const tree = trees.get(t.w.uid)
		const base = { wantedUid: t.w.uid, palId: t.w.palId, disabled: !!t.w.disabled }
		if (!s || !tree) {
			return {
				...base,
				status: 'unreachable',
				missingPassives: t.passives,
				implants: t.implants,
				reason: solvers.get(t.w.uid)!.explainUnreachable(t.pal),
				minutes: 0,
				generations: 0
			}
		}
		const missing = t.passives.filter((_, i) => !(s.mask & (1 << i)))
		return {
			...base,
			status: tree.source.kind === 'owned' ? 'have' : 'planned',
			tree,
			missingPassives: missing,
			implants: t.implants,
			reason: missing.length
				? missingReason(missing, owned)
				: strict(t) && s.other > t.implants.length
					? 'May carry other passives; a clean one needs too many eggs.'
					: undefined,
			minutes: treeMinutes(tree, settings.minutesPerEgg),
			generations: treeDepth(tree)
		}
	})

	return {
		targets: results,
		steps,
		catches: [...catchByKey.values()].sort((a, b) => a.minutes - b.minutes),
		totalMinutes,
		totalEggs: steps.reduce((sum, s) => sum + (s.node.source.kind === 'bred' ? s.node.source.eggs : 0), 0)
	}
}

function missingReason(missing: string[], owned: OwnedPal[]): string {
	const unowned = missing.filter((m) => !owned.some((o) => o.passives.includes(m)))
	if (unowned.length) return `None of your pals carry ${unowned.join(', ')}.`
	return `Can't fit ${missing.join(', ')} into a path within the generation limit.`
}
