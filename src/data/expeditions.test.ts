import { describe, expect, it } from 'vitest'
import { autoAssign, expeditions, firepower, palElements, payout, rewardRate, TEAM_CAP, type Candidate } from './expeditions'

const blazing = expeditions.find((e) => e.name === 'Blazing Cavern')!

describe('expeditions data', () => {
	it('has every expedition with rewards and requirements', () => {
		expect(expeditions).toHaveLength(18)
		expect(blazing.require).toEqual({ count: 20, element: 'Fire' })
		expect(expeditions.every((e) => e.rewards.length > 0 && e.firepower > 0 && e.minutes > 0)).toBe(true)
		expect(palElements('Anubis')).toEqual(['Ground'])
	})
})

describe('firepower', () => {
	const base = { level: 50, ivs: [50, 50, 50] as [number, number, number], souls: [0, 0, 0] as [number, number, number] }

	it('grows with level, and much more with condensation', () => {
		const plain = firepower('Anubis', { ...base, stars: 0 })
		expect(firepower('Anubis', { ...base, level: 60, stars: 0 })).toBeGreaterThan(plain)
		// Four stars: 25x from the squared term, plus 20% stats
		const four = firepower('Anubis', { ...base, stars: 4 })
		expect(four / plain).toBeGreaterThan(28)
		expect(four / plain).toBeLessThan(31)
	})
})

describe('auto-assign', () => {
	const pal = (key: string, palId: string, fp: number): Candidate => ({ key, palId, firepower: fp })

	it('fills the element requirement first, then the strongest of the rest', () => {
		const fire = Array.from({ length: 25 }, (_, i) => pal(`f${i}`, 'Kitsunebi', 100 + i))
		const strong = Array.from({ length: 120 }, (_, i) => pal(`s${i}`, 'Anubis', 10_000 + i))
		const team = autoAssign([...strong, ...fire], blazing)
		expect(team.members).toHaveLength(TEAM_CAP)
		expect(team.elementCount).toBe(20)
		expect(team.meetsRequirement).toBe(true)
		// The 20 strongest fire pals, then 80 of the strong ones
		expect(team.members.filter((m) => m.palId === 'Kitsunebi').map((m) => m.firepower).sort()[0]).toBe(105)
	})

	it('flags a Palbox short of the required element', () => {
		const team = autoAssign([pal('a', 'Anubis', 5), pal('f', 'Kitsunebi', 1)], blazing)
		expect(team.meetsRequirement).toBe(false)
		expect(team.members).toHaveLength(2)
	})
})

describe('reward rate', () => {
	it('follows the game curve, capped at 1000%', () => {
		expect(rewardRate(50, 100)).toBe(50)
		expect(rewardRate(100, 100)).toBe(100)
		expect(rewardRate(200, 100)).toBe(149)
		expect(rewardRate(250, 100)).toBeCloseTo(184)
		expect(rewardRate(5000, 100)).toBe(1000)
		expect(rewardRate(5000, 100, 35)).toBeCloseTo(1350)
	})

	it('scales each reward by the rate', () => {
		expect(payout({ item: 'Ore', min: 30, max: 50 }, 250)).toEqual({ min: 75, max: 125 })
	})
})
