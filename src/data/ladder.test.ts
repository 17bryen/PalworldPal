import { describe, expect, it } from 'vitest'
import { gameData, getPal, palIndex, pals, type Gender } from './gamedata'
import { breedingTarget, childrenOf, isSpecialResult, parentsOf } from './breeding'
import { buildLadder } from './ladder'

const id = (i: number) => pals[i].id

describe('breeding lookups', () => {
	it('finds every pair for a child and the child of every pair', () => {
		const lamball = palIndex('SheepBall')
		const cattiva = palIndex('PinkCat')
		const [{ child }] = childrenOf(lamball, cattiva)
		expect(parentsOf(child).some((p) => (p.a === lamball && p.b === cattiva) || (p.a === cattiva && p.b === lamball))).toBe(true)
		expect(childrenOf(cattiva, lamball)[0].child).toBe(child)
	})

	it('splits gender-specific pairs by which parent is male', () => {
		const rule = gameData.genderRules[0]
		const outcomes = childrenOf(rule.a, rule.b)
		expect(outcomes.length).toBeGreaterThan(0)
		expect(outcomes.find((o) => o.aGender === rule.aGender)?.child).toBe(rule.child)
	})

	it('averages breeding numbers with halves rounded up', () => {
		expect(breedingTarget({ ...getPal('SheepBall'), breedingPower: 2420 }, { ...getPal('PinkCat'), breedingPower: 3010 })).toBe(2715)
	})

	it('knows special results', () => {
		expect(isSpecialResult(palIndex('SheepBall'))).toBe(false)
		expect(isSpecialResult(palIndex('IceHorse_Dark'))).toBe(true)
	})
})

describe('XP ladder', () => {
	const mine: { palId: string; gender: Gender }[] = [
		{ palId: 'SheepBall', gender: 'M' },
		{ palId: 'PinkCat', gender: 'F' }
	]

	it('needs a male and a female, from My pals', () => {
		const same = buildLadder([{ palId: 'SheepBall', gender: 'M' }, { palId: 'PinkCat', gender: 'M' }], {}, 5)
		expect(same.steps).toEqual([])
		const first = buildLadder(mine, {}, 5).steps.find((s) => s.a !== s.b)!
		expect([first.aGender, first.bGender].sort()).toEqual(['F', 'M'])
	})

	it('breeds what two caught pals make, then builds on it', () => {
		const ladder = buildLadder(mine, { SheepBall: 5, PinkCat: 5 }, 5)
		const first = ladder.steps.filter((s) => s.round === 1)
		const child = id(childrenOf(palIndex('SheepBall'), palIndex('PinkCat'))[0].child)
		expect(first.map((s) => s.child)).toContain(child)
		expect(first.every((s) => ['SheepBall', 'PinkCat'].includes(s.a) && ['SheepBall', 'PinkCat'].includes(s.b))).toBe(true)
		// Later rounds may use earlier results as parents, and every step's parents are ready by then
		const readyBy = new Map<string, number>([['SheepBall', 0], ['PinkCat', 0]])
		for (const s of ladder.steps) {
			expect(readyBy.get(s.a)).toBeLessThan(s.round)
			expect(readyBy.get(s.b)).toBeLessThan(s.round)
			if (!readyBy.has(s.child)) readyBy.set(s.child, s.round)
		}
		expect(ladder.rounds).toBeGreaterThan(1)
	})

	it('tops up caught pals and skips finished ones', () => {
		const ladder = buildLadder([...mine, { palId: 'PinkCat', gender: 'M' }], { SheepBall: 5, PinkCat: 2 }, 5)
		const cattiva = ladder.steps.find((s) => s.child === 'PinkCat')
		expect(cattiva?.eggs).toBe(3)
		expect(ladder.steps.find((s) => s.child === 'SheepBall')).toBeUndefined()
	})

	it('leaves legendaries it cannot reach as stuck', () => {
		const ladder = buildLadder(mine, { SheepBall: 5, PinkCat: 5 }, 5)
		expect(ladder.stuck).toContain('JetDragon')
		expect(ladder.eggs).toBe(ladder.steps.reduce((n, s) => n + s.eggs, 0))
	})
})
