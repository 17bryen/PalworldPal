import { describe, expect, it } from 'vitest'
import { breedChild, palIndex, pals } from '../data/gamedata'
import { childChance } from './odds'
import { solvePlan } from './solver'
import type { OwnedPal, PlanSettings, WantedPal } from './types'

const settings: PlanSettings = {
	maxGenerations: 3,
	allowCatching: false,
	allowLegendaryCatches: false,
	onlyWantedPassives: true,
	minutesPerEgg: 10,
	catchPrefs: {}
}

let uid = 0
const own = (palId: string, gender: 'M' | 'F', passives: string[] = []): OwnedPal => ({ uid: `o${++uid}`, palId, gender, passives })
const want = (palId: string, passives: string[] = []): WantedPal => ({ uid: `w${++uid}`, palId, passives })

describe('odds', () => {
	it('matches the inheritance weights', () => {
		expect(childChance(2, 2, 4)).toBeCloseTo(0.6)
		expect(childChance(2, 2, 0)).toBeCloseTo(0.24)
		expect(childChance(2, 4, 4)).toBeCloseTo(0.25)
		expect(childChance(0, 0, 4)).toBeCloseTo(1)
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
		const w = want('SheepBall')
		const plan = solvePlan([own('SheepBall', 'M')], [w], settings)
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
		expect(plan.steps[0].eggs).toBeCloseTo(1 / 0.24)
	})

	it('prefers the parent without junk passives', () => {
		const plan = solvePlan(
			[
				own('LazyDragon', 'M', ['Swift', 'Brave', 'Coward']),
				own('LazyDragon', 'M', ['Swift']),
				own('ElecCat', 'F')
			],
			[want('LazyDragon_Electric', ['Swift'])],
			settings
		)
		const parents = plan.steps[0].parents
		const dragon = parents.find((p) => p.palId === 'LazyDragon')!
		expect(dragon.source.kind).toBe('owned')
		expect(dragon.otherPassives).toBe(0)
	})

	it('needs opposite genders', () => {
		const plan = solvePlan([own('LazyDragon', 'F'), own('ElecCat', 'F')], [want('LazyDragon_Electric')], { ...settings, maxGenerations: 1 })
		expect(plan.targets[0].status).toBe('unreachable')
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

	it('reuses earlier products across the wanted list', () => {
		const plan = solvePlan(
			[own('LazyDragon', 'M'), own('ElecCat', 'F')],
			[want('LazyDragon_Electric'), want('LazyDragon_Electric')],
			settings
		)
		expect(plan.steps).toHaveLength(1)
	})

	it('handles a big list quickly', () => {
		const ids = pals.filter((p) => p.wild && !p.legendary).map((p) => p.id)
		const passives = ['Swift', 'Legend', 'Lucky', 'Workaholic', 'Artisan', 'Serious', 'Brave', 'Nimble']
		const owned = Array.from({ length: 60 }, (_, i) =>
			own(ids[(i * 37) % ids.length], i % 2 ? 'M' : 'F', i % 3 ? [passives[i % passives.length]] : [])
		)
		const wanted = Array.from({ length: 12 }, (_, i) => want(ids[(i * 53 + 11) % ids.length], i % 2 ? ['Swift', 'Legend', 'Lucky', 'Workaholic'] : []))
		const start = performance.now()
		const plan = solvePlan(owned, wanted, { ...settings, maxGenerations: 5, allowCatching: true })
		const ms = performance.now() - start
		console.log(`12 targets, 60 owned, 5 generations: ${Math.round(ms)} ms, ${plan.steps.length} steps`)
		expect(plan.targets.every((t) => t.status !== 'unreachable')).toBe(true)
		expect(ms).toBeLessThan(30000)
	}, 60000)
})
