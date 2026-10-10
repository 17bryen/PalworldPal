import { pals, palCount, palIndex, breedChild } from '../data/gamedata'
import { worldTree } from '../data/regions'
import { childChance, MAX_PASSIVES } from './odds'
import {
	MAX_GENERATIONS,
	type CatchItem,
	type OwnedPal,
	type ParentSource,
	type Plan,
	type PlanNode,
	type PlanSettings,
	type PlanStep,
	type PalRef,
	type SolveProgress,
	type TargetResult,
	type WantedPal
} from './types'

// Gender slots: male, female, and "either" (only used for the wanted pal itself)
const MALE = 0
const FEMALE = 1
const EITHER = 2
type Slot = 0 | 1 | 2
const TARGET_SLOTS: Slot[] = [EITHER]
const PARENT_SLOTS: Slot[] = [MALE, FEMALE]

/** Extra minutes to catch a pal that lives (almost) only in the late-game World Tree */
const WORLD_TREE_MINUTES = 10

/** Paths needing more eggs than this for one step are not worth suggesting */
const MAX_EGGS_PER_STEP = 500

/** States kept per pal and gender in each pass when passives are wanted */
const CAPS = [3, 6, 12]

/**
 * For each count of free passive slots, the limits on unwanted passives a kept egg may have:
 * clean, one or two extras, or whatever the first egg brings
 */
const OTHER_OPTIONS = Array.from({ length: MAX_PASSIVES + 1 }, (_, room) => [...new Set([0, 1, 2, room])].filter((o) => o <= room))

// Every pairing the game allows, as parallel arrays: parent a (gender), parent b (gender) -> child
const pairA: number[] = []
const pairGA: Slot[] = []
const pairB: number[] = []
const pairGB: Slot[] = []
const pairC: number[] = []
/** Pair indices grouped by child, for working backwards from a target */
const pairsByChild: number[][] = Array.from({ length: palCount }, () => [])

for (let a = 0; a < palCount; a++) {
	for (let b = a; b < palCount; b++) {
		const combos: [Slot, Slot][] = a === b ? [[MALE, FEMALE]] : [[MALE, FEMALE], [FEMALE, MALE]]
		for (const [ga, gb] of combos) {
			const c = breedChild(a, ga === MALE ? 'M' : 'F', b, gb === MALE ? 'M' : 'F')
			if (c < 0) continue
			pairsByChild[c].push(pairA.length)
			pairA.push(a)
			pairGA.push(ga)
			pairB.push(b)
			pairGB.push(gb)
			pairC.push(c)
		}
	}
}

/** A pal that's already available: owned, or produced earlier in the plan */
interface Instance {
	pal: number
	slot: Slot
	passives: string[]
	other: number
	source: ParentSource
}

type StateSource =
	| { t: 'instance'; inst: Instance }
	| { t: 'catch'; minutes: number }
	| { t: 'bred'; a: State; b: State; eggs: number }

interface State {
	pal: number
	slot: Slot
	/** Bit i set when the pal carries wanted passive i */
	mask: number
	/** Passives that aren't wanted (upper bound) */
	other: number
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

/**
 * Keeps only states no other state beats on passives, junk and cost, sorted by cost. Past `cap` states, drops
 * the one with the fewest wanted passives, then the most junk, then the highest cost.
 */
function insert(front: State[], s: State, cap = Infinity): void {
	for (const t of front) {
		if ((t.mask & s.mask) === s.mask && t.other <= s.other && t.cost <= s.cost) return
	}
	for (let i = front.length - 1; i >= 0; i--) {
		const t = front[i]
		if ((s.mask & t.mask) === t.mask && s.other <= t.other && s.cost <= t.cost) front.splice(i, 1)
	}
	// Fronts stay sorted by cost so the search can stop early once costs pass the bound
	let at = front.length
	while (at > 0 && front[at - 1].cost > s.cost) at--
	front.splice(at, 0, s)
	if (front.length > cap) {
		let worst = 0
		for (let i = 1; i < front.length; i++) {
			if (worse(front[i], front[worst])) worst = i
		}
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

function slotOf(gender: 'M' | 'F'): Slot {
	return gender === 'M' ? MALE : FEMALE
}

function genderOf(slot: Slot): 'M' | 'F' | null {
	return slot === MALE ? 'M' : slot === FEMALE ? 'F' : null
}

class TargetSolver {
	constructor(
		private settings: PlanSettings,
		private instances: Instance[]
	) {}

	catchMinutes(pal: number, isTarget: boolean, ignoreLimits = false): number | null {
		const p = pals[pal]
		if (!p.wild) return null
		const presence = worldTree.get(p.id)
		const minutes = p.catchMinutes + (presence === 'only' || presence === 'mostly' ? WORLD_TREE_MINUTES : 0)
		if (ignoreLimits) return minutes
		if (!this.settings.allowCatching) return null
		const pref = this.settings.catchPrefs[p.id]
		if (pref === 'never') return null
		// A legendary on the wanted list may still be caught directly
		if (p.legendary && !this.settings.allowLegendaryCatches && !isTarget) return null
		if (pref === 'easy') return 1
		if (pref === 'hard') return minutes * 3
		return minutes
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
	best(target: number, wanted: string[], strict: boolean, quick = false): State | null {
		if (!wanted.length) return pickBest(this.solve(target, wanted), strict)
		let best: State | null = null
		for (const cap of quick ? [CAPS[0]] : CAPS) {
			const ideal = best && popcount(best.mask) === wanted.length && !(strict && best.other > 0)
			const found = this.solve(target, wanted, cap, ideal ? best!.cost : Infinity)
			best = pickBest(best ? [...found, best] : found, strict)
		}
		return best
	}

	solve(target: number, wanted: string[], cap = Infinity, bound = Infinity): State[] {
		const maxGen = this.settings.maxGenerations
		const dist = this.distances(target, maxGen)
		const bit = (name: string) => wanted.indexOf(name)
		const minutesPerEgg = this.settings.minutesPerEgg

		let fronts: State[][] = Array.from({ length: palCount * 3 }, () => [])
		for (const inst of this.instances) {
			if (dist[inst.pal] > maxGen) continue
			let mask = 0
			let other = inst.other
			for (const name of inst.passives) {
				const i = bit(name)
				if (i >= 0) mask |= 1 << i
				else other++
			}
			insert(fronts[inst.pal * 3 + inst.slot], {
				pal: inst.pal,
				slot: inst.slot,
				mask,
				other,
				cost: 0,
				gen: 0,
				born: 0,
				src: { t: 'instance', inst }
			})
		}
		for (let pal = 0; pal < palCount; pal++) {
			if (dist[pal] > maxGen) continue
			const minutes = this.catchMinutes(pal, pal === target)
			if (minutes == null) continue
			for (const slot of [MALE, FEMALE] as Slot[]) {
				insert(fronts[pal * 3 + slot], {
					pal,
					slot,
					mask: 0,
					other: 0,
					cost: minutes,
					gen: 0,
					born: 0,
					src: { t: 'catch', minutes }
				})
			}
		}

		for (let level = 1; level <= maxGen; level++) {
			const next = fronts.map((f) => f.slice())
			for (let i = 0; i < pairC.length; i++) {
				const c = pairC[i]
				if (dist[c] > maxGen - level) continue
				const fa = fronts[pairA[i] * 3 + pairGA[i]]
				const fb = fronts[pairB[i] * 3 + pairGB[i]]
				if (!fa.length || !fb.length) continue
				const slots = c === target ? TARGET_SLOTS : PARENT_SLOTS
				const male = pals[c].maleChance
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
						const k = popcount(mask)
						const pool = k + sa.other + sb.other
						const gen = 1 + Math.max(sa.gen, sb.gen)
						for (const maxOther of OTHER_OPTIONS[MAX_PASSIVES - k]) {
							const pPassives = chance(k, pool, maxOther)
							if (pPassives <= 0) continue
							for (const slot of slots) {
								const pGender = slot === EITHER ? 1 : slot === MALE ? male : 1 - male
								if (pGender <= 0) continue
								const eggs = 1 / (pPassives * pGender)
								if (eggs > MAX_EGGS_PER_STEP) continue
								const cost = base + eggs * minutesPerEgg
								if (cost + dist[c] * minutesPerEgg > bound) continue
								insert(next[c * 3 + slot], {
									pal: c,
									slot,
									mask,
									other: maxOther,
									cost,
									gen,
									born: level,
									src: { t: 'bred', a: sa, b: sb, eggs }
								}, cap)
							}
						}
					}
				}
			}
			fronts = next
		}

		return [...fronts[target * 3 + MALE], ...fronts[target * 3 + FEMALE], ...fronts[target * 3 + EITHER]]
	}

	/** First generation at which the target can exist, ignoring passives; Infinity if never */
	reachable(target: number, mode: 'settings' | 'all' | 'noLegendLimit'): number {
		const have = new Uint8Array(palCount * 2)
		for (const inst of this.instances) {
			if (inst.slot === EITHER) {
				have[inst.pal * 2] = 1
				have[inst.pal * 2 + 1] = 1
			} else have[inst.pal * 2 + inst.slot] = 1
		}
		for (let pal = 0; pal < palCount; pal++) {
			let minutes: number | null
			if (mode === 'all') minutes = this.catchMinutes(pal, true, true)
			else if (mode === 'noLegendLimit') minutes = this.settings.allowCatching ? this.catchMinutes(pal, true) : null
			else minutes = this.catchMinutes(pal, pal === target)
			if (minutes != null) {
				have[pal * 2] = 1
				have[pal * 2 + 1] = 1
			}
		}
		if (have[target * 2] || have[target * 2 + 1]) return 0
		for (let level = 1; level <= MAX_GENERATIONS; level++) {
			const snapshot = have.slice()
			for (let i = 0; i < pairC.length; i++) {
				if (snapshot[pairA[i] * 2 + pairGA[i]] && snapshot[pairB[i] * 2 + pairGB[i]]) {
					have[pairC[i] * 2] = 1
					have[pairC[i] * 2 + 1] = 1
				}
			}
			if (have[target * 2]) return level
		}
		return Infinity
	}

	explainUnreachable(target: number): string {
		const p = pals[target]
		const limit = this.settings.maxGenerations
		const bredFromOthers = pairsByChild[target].some((i) => pairA[i] !== target || pairB[i] !== target)
		if (!bredFromOthers) {
			if (!p.wild) return 'Can\'t be bred from other pals or caught in the wild.'
			if (!this.settings.allowCatching) return 'Can only be caught. Turn on catching to plan it.'
			if (this.settings.catchPrefs[p.id] === 'never') return 'Can only be caught, and it\'s marked as never catch.'
		}
		const withSettings = this.reachable(target, 'settings')
		if (withSettings <= MAX_GENERATIONS) {
			if (withSettings > limit) return `Needs ${withSettings} generations; the limit is ${limit}.`
			return 'Every path needs more than 500 eggs for one step.'
		}
		if (this.reachable(target, 'all') <= MAX_GENERATIONS) {
			if (!this.settings.allowCatching) return 'Needs pals you don\'t own. Turn on catching to plan it.'
			if (!this.settings.allowLegendaryCatches && this.reachable(target, 'noLegendLimit') <= MAX_GENERATIONS)
				return 'Needs a legendary catch.'
			return 'Needs a pal you marked as never catch.'
		}
		return `Can't be reached from your pals within ${MAX_GENERATIONS} generations.`
	}
}

/** Most wanted passives first, then clean (when required), then cheapest, then shallowest */
function pickBest(states: State[], strict: boolean): State | null {
	let best: State | null = null
	let bestKey: number[] = []
	for (const s of states) {
		const key = [-popcount(s.mask), strict && s.other > 0 ? 1 : 0, s.cost, s.gen]
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

export function solvePlan(
	owned: OwnedPal[],
	wanted: WantedPal[],
	settings: PlanSettings,
	onProgress?: (p: SolveProgress) => void
): Plan {
	const instances: Instance[] = owned.map((o) => ({
		pal: palIndex(o.palId),
		slot: slotOf(o.gender),
		passives: o.passives,
		other: 0,
		source: { kind: 'owned', ownedUid: o.uid }
	}))
	const targets = wanted.map((w) => ({ w, pal: palIndex(w.palId), passives: [...new Set(w.passives)].slice(0, MAX_PASSIVES) }))
	const total = targets.length * 2
	let done = 0
	const report = (label: string) => onProgress?.({ done, total, label })
	const strict = (t: (typeof targets)[number]) => settings.onlyWantedPassives && t.passives.length > 0

	// First pass: cost of each target on its own, to plan the cheapest ones first so later
	// targets can build on what they produce
	const firstPass = targets.map((t) => {
		report(`Sizing up ${pals[t.pal].name}`)
		const best = new TargetSolver(settings, instances).best(t.pal, t.passives, strict(t), true)
		done++
		return best ? best.cost - popcount(best.mask) * 1e6 : Infinity
	})
	const order = targets.map((_, i) => i).sort((x, y) => firstPass[x] - firstPass[y])

	const steps: PlanStep[] = []
	const results = new Map<string, TargetResult>()

	for (const idx of order) {
		const t = targets[idx]
		const name = pals[t.pal].name
		report(`Planning ${name}`)
		const solver = new TargetSolver(settings, instances)
		const best = solver.best(t.pal, t.passives, strict(t))
		done++

		if (!best) {
			results.set(t.w.uid, {
				wantedUid: t.w.uid,
				palId: t.w.palId,
				status: 'unreachable',
				missingPassives: t.passives,
				reason: solver.explainUnreachable(t.pal),
				minutes: 0,
				generations: 0
			})
			continue
		}

		const memo = new Map<State, PlanNode>()
		const produced: PlanNode[] = []
		const build = (s: State): PlanNode => {
			const base = {
				palId: pals[s.pal].id,
				gender: genderOf(s.slot),
				passives: t.passives.filter((_, i) => s.mask & (1 << i)),
				otherPassives: s.other
			}
			if (s.src.t === 'instance') return { ...base, source: s.src.inst.source }
			if (s.src.t === 'catch') {
				const node: PlanNode = { ...base, source: { kind: 'catch', minutes: s.src.minutes } }
				produced.push(node)
				return node
			}
			// The same bred pal can feed two branches; breed it once and refer back to it
			const seen = memo.get(s)
			if (seen) return strip(seen)
			const parents: [PlanNode, PlanNode] = [build(s.src.a), build(s.src.b)]
			const stepId = steps.length + 1
			const node: PlanNode = { ...base, source: { kind: 'step', stepId }, breed: { stepId, eggs: s.src.eggs, parents } }
			steps.push({
				id: stepId,
				child: strip(node),
				parents: [strip(parents[0]), strip(parents[1])],
				eggs: s.src.eggs,
				forWanted: t.w.uid
			})
			memo.set(s, node)
			produced.push(node)
			return node
		}
		const tree = build(best)

		// Anything bred or caught for this target is free to reuse for the rest of the list
		for (const node of produced) {
			const slots: Slot[] = node.gender ? [slotOf(node.gender)] : [MALE, FEMALE]
			for (const slot of slots) {
				instances.push({
					pal: palIndex(node.palId),
					slot,
					passives: node.passives,
					other: node.otherPassives,
					source: node.source
				})
			}
		}

		const missing = t.passives.filter((_, i) => !(best.mask & (1 << i)))
		results.set(t.w.uid, {
			wantedUid: t.w.uid,
			palId: t.w.palId,
			status: best.src.t === 'instance' && best.src.inst.source.kind === 'owned' ? 'have' : 'planned',
			tree,
			missingPassives: missing,
			reason: missing.length
				? missingReason(missing, owned)
				: strict(t) && best.other > 0
					? 'May carry other passives; a clean one needs too many eggs.'
					: undefined,
			minutes: best.cost,
			generations: best.gen
		})
	}

	const catches = collectCatches(results)
	return {
		targets: wanted.map((w) => results.get(w.uid)!),
		steps,
		catches,
		totalMinutes: [...results.values()].reduce((sum, r) => sum + r.minutes, 0),
		totalEggs: steps.reduce((sum, s) => sum + s.eggs, 0)
	}
}

function strip(node: PlanNode): PalRef {
	const { breed: _breed, ...ref } = node
	return ref
}

function missingReason(missing: string[], owned: OwnedPal[]): string {
	const unowned = missing.filter((m) => !owned.some((o) => o.passives.includes(m)))
	if (unowned.length) return `None of your pals carry ${unowned.join(', ')}.`
	return `Can't fit ${missing.join(', ')} into a path within the generation limit.`
}

function collectCatches(results: Map<string, TargetResult>): CatchItem[] {
	const byPal = new Map<string, CatchItem>()
	const walk = (node: PlanNode, wantedUid: string) => {
		if (node.source.kind === 'catch' && !node.breed) {
			let item = byPal.get(node.palId)
			if (!item) {
				item = { palId: node.palId, male: 0, female: 0, minutes: node.source.minutes, forWanted: [] }
				byPal.set(node.palId, item)
			}
			if (node.gender === 'M') item.male = 1
			else if (node.gender === 'F') item.female = 1
			if (!item.forWanted.includes(wantedUid)) item.forWanted.push(wantedUid)
		}
		node.breed?.parents.forEach((p) => walk(p, wantedUid))
	}
	for (const r of results.values()) if (r.tree) walk(r.tree, r.wantedUid)
	return [...byPal.values()].sort((a, b) => a.minutes - b.minutes)
}
