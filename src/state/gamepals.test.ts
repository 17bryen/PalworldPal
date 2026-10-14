import { describe, expect, it } from 'vitest'
import { parsePals } from '../../electron/gamelink'
import { pals as allPals } from '../data/gamedata'
import { solvePlan } from '../solver/solver'
import type { OwnedPal, PlanSettings } from '../solver/types'
import { describeLocation, normalizeGamePals, ownedLocation, planAdd } from './gamepals'

describe('game pals', () => {
	it('reads pals.json and drops malformed entries', () => {
		const text = '{"v":1,"mod":"1.4.0","scanMs":12.5,"pals":[{"c":"PinkCat","g":2,"p":["Rare"],"iv":[1,2,3]},{"c":5},{"c":"Anubis","g":1,"p":[3],"iv":[]}]}'
		expect(parsePals(text, 7)).toEqual({ pals: [{ c: 'PinkCat', g: 2, p: ['Rare'], iv: [1, 2, 3] }], mod: '1.4.0', at: 7 })
		expect(parsePals('{"v":1,"pals":[{"c":"Pink', 7)).toBeNull()
	})

	it('maps game ids to pals and passives, folding alphas and case', () => {
		const pals = normalizeGamePals([
			{ c: 'BOSS_KingBahamut', g: 1, p: ['ElementBoost_Fire_2_PAL', 'TrainerATK_UP_1'], iv: [92, 86, 99] },
			{ c: 'Sheepball', g: 2, p: ['CraftSpeed_up3', 'NotAPassive'], iv: [5, 52, 28] },
			{ c: 'Male_DarkTrader01', g: 0, p: [], iv: [0, 0, 0] }
		])
		expect(pals.map((p) => [p.palId, p.gender, p.passives])).toEqual([
			['KingBahamut', 'M', ['Flame Emperor', 'Vanguard']],
			['SheepBall', 'F', ['Remarkable Craftsmanship']]
		])
	})

	it('says where each pal is: party slot, or Palbox page and slot', () => {
		const [party, box, old] = normalizeGamePals([
			{ c: 'PinkCat', g: 2, p: [], iv: [1, 2, 3], in: 'party', s: 3 },
			{ c: 'Anubis', g: 1, p: [], iv: [4, 5, 6], in: 'box', s: 73 },
			{ c: 'SheepBall', g: 1, p: [], iv: [7, 8, 9] }
		])
		expect(describeLocation(party.where!)).toBe('Party 4')
		expect(describeLocation(box.where!)).toBe('Palbox 3:14')
		expect(old.where).toBeUndefined()
	})

	it('falls back to where a synced pal was last seen', () => {
		const pal: OwnedPal = { uid: 'a', palId: 'PinkCat', gender: 'F', passives: [], game: 'k1', seen: { box: 'palbox', slot: 73 } }
		expect(ownedLocation(pal, new Map([['k1', { box: 'party', slot: 0 }]]))).toBe('Party 1')
		expect(ownedLocation(pal, new Map())).toBe('Last Seen: Palbox 3:14')
		expect(ownedLocation({ ...pal, seen: undefined }, new Map())).toBe('Not seen in the game yet')
		expect(ownedLocation({ ...pal, game: undefined }, new Map())).toBeUndefined()
	})

	it('keeps keys stable and tells identical twins apart', () => {
		const twin = { c: 'PinkCat', g: 2, p: ['Rare'], iv: [1, 2, 3] }
		const keys = normalizeGamePals([twin, { ...twin, iv: [9, 9, 9] }, twin]).map((p) => p.key)
		expect(new Set(keys).size).toBe(3)
		expect(normalizeGamePals([twin, twin]).map((p) => p.key)).toEqual(keys.filter((k) => !k.includes('9/9/9')))
	})

	it('links pals typed in by hand instead of adding them twice', () => {
		const game = normalizeGamePals([
			{ c: 'PinkCat', g: 2, p: ['Rare', 'Nocturnal'], iv: [1, 2, 3] },
			{ c: 'PinkCat', g: 2, p: ['Rare', 'Nocturnal'], iv: [4, 5, 6] },
			{ c: 'Anubis', g: 1, p: [], iv: [7, 8, 9] }
		])
		const owned: OwnedPal[] = [
			{ uid: 'a', palId: 'PinkCat', gender: 'F', passives: ['Insomnia', 'Lucky'] },
			{ uid: 'b', palId: 'Anubis', gender: 'M', passives: [], game: game[2].key }
		]
		const plan = planAdd(owned, game)
		expect([...plan.links]).toEqual([['a', game[0].key]])
		expect(plan.adds.map((g) => g.key)).toEqual([game[1].key])
		expect(plan.linked.has(game[2].key)).toBe(true)
	})
})

describe('a full Palbox', () => {
	it('plans quickly with about 960 owned pals', () => {
		const passives = ['Lucky', 'Artisan', 'Swift', 'Legend', 'Burly Body', 'Ferocious', 'Serious', 'Runner']
		const owned: OwnedPal[] = Array.from({ length: 960 }, (_, i) => ({
			uid: `o${i}`,
			palId: allPals[(i * 7) % 150].id,
			gender: i % 2 ? 'M' : 'F',
			passives: passives.filter((_, j) => (i + j) % 5 === 0)
		}))
		const settings: PlanSettings = {
			maxGenerations: 4,
			allowCatching: true,
			allowLegendaryCatches: false,
			onlyWantedPassives: true,
			minutesPerEgg: 10,
			catchPrefs: {},
			disabledRegions: [],
			pins: {}
		}
		const wanted = [
			{ uid: 'w1', palId: 'Anubis', passives: ['Artisan', 'Swift'] },
			{ uid: 'w2', palId: 'JetDragon', passives: ['Legend', 'Swift', 'Runner'] },
			{ uid: 'w3', palId: 'PinkCat', passives: ['Lucky'] }
		]
		const started = performance.now()
		const plan = solvePlan(owned, wanted, settings)
		const ms = performance.now() - started
		expect(plan.targets).toHaveLength(3)
		expect(ms).toBeLessThan(5000)
		console.log(`solved 3 wanted pals from 960 owned in ${ms.toFixed(0)} ms`)
	})
})
