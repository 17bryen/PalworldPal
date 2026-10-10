import { describe, expect, it } from 'vitest'
import { breedChild, palIndex, pals } from '../data/gamedata'
import { childChance, yakumoOutcomes } from './odds'
import { solvePlan } from './solver'
import { pinKey, type OwnedPal, type PlanNode, type PlanSettings, type WantedPal } from './types'

const settings: PlanSettings = {
	maxGenerations: 3,
	allowCatching: false,
	allowLegendaryCatches: false,
	onlyWantedPassives: true,
	minutesPerEgg: 10,
	catchPrefs: {},
	disabledRegions: [],
	pins: {}
}

let uid = 0
const own = (palId: string, gender: 'M' | 'F', passives: string[] = [], stars?: number): OwnedPal => ({ uid: `o${++uid}`, palId, gender, passives, stars })
const want = (palId: string, passives: string[] = [], disabled = false): WantedPal => ({ uid: `w${++uid}`, palId, passives, disabled })
const eggs = (node: PlanNode) => (node.source.kind === 'bred' ? node.source.eggs : 0)

describe('odds', () => {
	it('matches the inheritance weights', () => {
		expect(childChance(2, 2, 4)).toBeCloseTo(0.6)
		expect(childChance(2, 2, 0)).toBeCloseTo(0.24)
		expect(childChance(2, 4, 4)).toBeCloseTo(0.25)
		expect(childChance(0, 0, 4)).toBeCloseTo(1)
	})

	it('rolls Yakumo passives in order into free slots', () => {
		const outcomes = yakumoOutcomes(['Swift', 'Legend'], 0.3)
		expect(outcomes.reduce((s, o) => s + o.chance, 0)).toBeCloseTo(1)
		const clean = outcomes.filter((o) => o.own === 0 && o.landed.join() === 'Swift').reduce((s, o) => s + o.chance, 0)
		expect(clean).toBeCloseTo(0.4 * 0.3 * 0.7)
	})
})

describe('breeding table', () => {
	it('knows unique and gender-specific combos', () => {
		const i = palIndex
		expect(pals[breedChild(i('LazyDragon'), 'M', i('ElecCat'), 'F')].id).toBe('LazyDragon_Electric')
		expect(pals[breedChild(i('CatMage'), 'F', i('FoxMage'), 'M')].id).toBe('CatMage_Fire')
		expect(pals[breedChild(i('CatMage'), 'M', i('FoxMage'), 'F')].id).toBe('FoxMage_Dark')
	})
})

describe('solvePlan', () => {
	it('reports pals already owned', () => {
		const plan = solvePlan([own('SheepBall', 'M')], [want('SheepBall')], settings)
		expect(plan.targets[0].status).toBe('have')
		expect(plan.steps).toHaveLength(0)
	})

	it('plans a one-step unique combo', () => {
		const plan = solvePlan([own('LazyDragon', 'M'), own('ElecCat', 'F')], [want('LazyDragon_Electric')], settings)
		expect(plan.targets[0].status).toBe('planned')
		expect(plan.steps).toHaveLength(1)
		expect(plan.targets[0].generations).toBe(1)
	})

	it('carries wanted passives and prices the eggs', () => {
		const plan = solvePlan(
			[own('LazyDragon', 'M', ['Swift']), own('ElecCat', 'F', ['Legend'])],
			[want('LazyDragon_Electric', ['Swift', 'Legend'])],
			settings
		)
		const t = plan.targets[0]
		expect(t.missingPassives).toEqual([])
		expect(t.tree?.passives.sort()).toEqual(['Legend', 'Swift'])
		expect(eggs(plan.steps[0].node)).toBeCloseTo(1 / 0.24)
	})

	it('prefers the parent without junk passives', () => {
		const plan = solvePlan(
			[own('LazyDragon', 'M', ['Swift', 'Brave', 'Coward']), own('LazyDragon', 'M', ['Swift']), own('ElecCat', 'F')],
			[want('LazyDragon_Electric', ['Swift'])],
			settings
		)
		const dragon = plan.steps[0].node.parents!.find((p) => p.palId === 'LazyDragon')!
		expect(dragon.source.kind).toBe('owned')
		expect(plan.targets[0].tree && eggs(plan.targets[0].tree)).toBeLessThan(5)
	})

	it('needs opposite genders between owned pals', () => {
		const plan = solvePlan([own('LazyDragon', 'F'), own('ElecCat', 'F')], [want('LazyDragon_Electric')], { ...settings, maxGenerations: 1 })
		expect(plan.targets[0].status).toBe('unreachable')
	})

	it('lets a catch take whichever gender a bred parent needs', () => {
		const plan = solvePlan([], [want('LazyDragon_Electric')], { ...settings, allowCatching: true, maxGenerations: 2 })
		const walk = (n: PlanNode): PlanNode[] => [n, ...(n.parents ?? []).flatMap(walk)]
		for (const n of walk(plan.targets[0].tree!)) {
			const parents = n.parents
			if (!parents) continue
			// A bred parent next to a catch never needs a set gender
			if (parents.some((p) => p.source.kind === 'catch')) {
				for (const p of parents) if (p.source.kind === 'bred') expect(p.gender).toBeNull()
			}
		}
	})

	it('flags unreachable pals with a reason', () => {
		const plan = solvePlan([own('SheepBall', 'M'), own('SheepBall', 'F')], [want('JetDragon')], settings)
		expect(plan.targets[0].status).toBe('unreachable')
		expect(plan.targets[0].reason).toMatch(/caught/)

		const caught = solvePlan([], [want('JetDragon')], { ...settings, allowCatching: true })
		expect(caught.targets[0].status).toBe('planned')
		expect(caught.catches.map((c) => c.palId)).toEqual(['JetDragon'])
	})

	it('suggests catches and skips legendaries when asked', () => {
		const plan = solvePlan([], [want('LazyDragon_Electric')], { ...settings, allowCatching: true, maxGenerations: 2 })
		expect(plan.targets[0].status).toBe('planned')
		const ids = plan.catches.map((c) => c.palId)
		expect(ids.length).toBeGreaterThan(0)
		expect(ids.some((id) => pals[palIndex(id)].legendary)).toBe(false)
	})

	it('shares identical steps across the wanted list', () => {
		const plan = solvePlan([own('LazyDragon', 'M'), own('ElecCat', 'F')], [want('LazyDragon_Electric'), want('LazyDragon_Electric')], settings)
		expect(plan.steps).toHaveLength(1)
		expect(plan.steps[0].forWanted).toHaveLength(2)
	})

	it('leaves disabled wanted pals out of the steps', () => {
		const plan = solvePlan(
			[own('LazyDragon', 'M'), own('ElecCat', 'F'), own('SheepBall', 'M'), own('SheepBall', 'F')],
			[want('LazyDragon_Electric', [], true), want('SheepBall')],
			settings
		)
		expect(plan.targets[0].disabled).toBe(true)
		expect(plan.targets[0].tree).toBeDefined()
		expect(plan.steps).toHaveLength(0)
	})

	it('catches with Yakumo to get a passive', () => {
		const plan = solvePlan([own('GuardianDog', 'F', ['Swift'], 4)], [want('SheepBall', ['Swift'])], { ...settings, allowCatching: true })
		const tree = plan.targets[0].tree!
		expect(tree.source.kind).toBe('catch')
		expect(tree.passives).toEqual(['Swift'])
		expect(plan.catches[0].yakumo?.catches).toBeCloseTo(1 / (0.4 * 0.3))
	})

	it('follows a pinned pair', () => {
		const target = 'CaptainPenguin'
		const free = { ...settings, allowCatching: true, maxGenerations: 2, catchPrefs: { [target]: 'never' as const } }
		const first = solvePlan([], [want(target)], free)
		const chosen = first.targets[0].tree!.parents!.map((p) => p.palId)
		// Pin another pair that also makes the target and check the plan switches to it
		const child = palIndex(target)
		const alt = pals
			.flatMap((a, ia) => pals.slice(ia + 1).map((b, j) => [a.id, b.id, breedChild(ia, 'M', ia + 1 + j, 'F')] as const))
			.find(([a, b, c]) => c === child && !(chosen.includes(a) && chosen.includes(b)) && pals[palIndex(a)].wild && pals[palIndex(b)].wild)!
		const pinned = solvePlan([], [want(target)], { ...free, pins: { [pinKey(target, [])]: { kind: 'pair', a: alt[0], b: alt[1] } } })
		expect(pinned.targets[0].tree!.parents!.map((p) => p.palId).sort()).toEqual([alt[0], alt[1]].sort())
	})

	it('handles a big list quickly', () => {
		const ids = pals.filter((p) => p.wild && !p.legendary).map((p) => p.id)
		const passives = ['Swift', 'Legend', 'Lucky', 'Workaholic', 'Artisan', 'Serious', 'Brave', 'Nimble']
		const owned = Array.from({ length: 60 }, (_, i) => own(ids[(i * 37) % ids.length], i % 2 ? 'M' : 'F', i % 3 ? [passives[i % passives.length]] : []))
		const wanted = Array.from({ length: 12 }, (_, i) => want(ids[(i * 53 + 11) % ids.length], i % 2 ? ['Swift', 'Legend', 'Lucky', 'Workaholic'] : []))
		const start = performance.now()
		const plan = solvePlan(owned, wanted, { ...settings, maxGenerations: 5, allowCatching: true })
		const ms = performance.now() - start
		console.log(`12 targets, 60 owned, 5 generations: ${Math.round(ms)} ms, ${plan.steps.length} steps`)
		expect(plan.targets.every((t) => t.status !== 'unreachable')).toBe(true)
		expect(ms).toBeLessThan(60000)
	}, 120000)
})
