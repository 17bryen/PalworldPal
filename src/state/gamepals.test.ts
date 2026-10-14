import { describe, expect, it } from 'vitest'
import { parsePals } from '../../electron/gamelink'
import { pals as allPals } from '../data/gamedata'
import { solvePlan } from '../solver/solver'
import type { OwnedPal, PlanSettings } from '../solver/types'
import { describeLocation, diffGamePals, goneKeys, normalizeGamePals, ownedLocation, planAdd } from './gamepals'
import { sanitize, withGamePresence, withWorld, worldLabel } from './store'

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

	it('follows a party pal through the Surgery Table', () => {
		const before = normalizeGamePals([
			{ c: 'IceHorse', g: 1, p: ['MoveSpeed_up_3', 'SalePrice_Up_1'], iv: [90, 80, 70], in: 'party', s: 4, n: 'Frosty' },
			{ c: 'PinkCat', g: 2, p: [], iv: [1, 2, 3], in: 'box', s: 10 }
		])
		const after = normalizeGamePals([
			{ c: 'IceHorse', g: 2, p: ['MoveSpeed_up_3', 'MoveSpeed_up_2', 'Test_PalEgg_HatchingSpeed_Up'], iv: [90, 80, 70], in: 'party', s: 4, n: 'Frosty' },
			{ c: 'PinkCat', g: 2, p: [], iv: [1, 2, 3], in: 'box', s: 10 }
		])
		const changes = diffGamePals(before, after)
		expect(changes).toHaveLength(1)
		expect(changes[0].from).toBe(before[0].key)
		expect(changes[0].to.gender).toBe('F')
		expect(changes[0].to.passives).toEqual(['Swift', 'Runner', 'Philanthropist'])
		expect(changes[0].to.name).toBe('Frosty')
	})

	it('follows IV fruits too, but not a different species in the slot', () => {
		const before = normalizeGamePals([{ c: 'IceHorse', g: 1, p: [], iv: [90, 8, 70], in: 'party', s: 4 }])
		const fed = normalizeGamePals([{ c: 'IceHorse', g: 1, p: [], iv: [90, 100, 70], in: 'party', s: 4 }])
		const otherSpecies = normalizeGamePals([{ c: 'Anubis', g: 1, p: [], iv: [90, 8, 70], in: 'party', s: 4 }])
		expect(diffGamePals(before, fed).map((c) => c.from)).toEqual([before[0].key])
		expect(diffGamePals(before, otherSpecies)).toEqual([])
	})

	it("uses the game's id when the mod sends one, so nothing about the pal changes its key", () => {
		const id = 'ab'.repeat(16)
		const [a] = normalizeGamePals([{ id, c: 'IceHorse', g: 1, p: [], iv: [1, 2, 3], in: 'party', s: 4 }])
		const [b] = normalizeGamePals([{ id, c: 'IceHorse', g: 2, p: ['Rare'], iv: [9, 9, 9], in: 'box', s: 40 }])
		expect(a.key).toBe(`id:${id}`)
		expect(b.key).toBe(a.key)
		expect(a.contentKey).not.toBe(b.contentKey)
	})

	it('treats a pal that left the party or Palbox and turned up nowhere as gone', () => {
		const pal = (id: string, box: string, s: number) => ({ id: id.repeat(32), c: 'PinkCat', g: 2, p: [], iv: [1, 2, 3], in: box, s })
		const before = normalizeGamePals([pal('a', 'box', 1), pal('b', 'box', 2), pal('c', 'party', 0), pal('d', 'other', 0)])
		// b was sold; c went to work at a base and shows as "other"; d is out of range at a base
		const after = normalizeGamePals([pal('a', 'box', 1), pal('c', 'other', 3)])
		expect(goneKeys(before, after, diffGamePals(before, after))).toEqual([`id:${'b'.repeat(32)}`])
	})

	it('says where a pal outside the Palbox is', () => {
		expect(describeLocation({ box: 'other', slot: 3 })).toBe('Outside the Palbox (at a base or in storage)')
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

describe('adding game pals', () => {
	it('counts entries synced before ids as already added', () => {
		const [g] = normalizeGamePals([{ id: 'c'.repeat(32), c: 'PinkCat', g: 2, p: [], iv: [1, 2, 3], in: 'box', s: 1 }])
		const owned: OwnedPal[] = [{ uid: 'old', palId: 'PinkCat', gender: 'F', passives: [], game: g.contentKey }]
		const plan = planAdd(owned, [g])
		expect(plan.adds).toEqual([])
		expect(plan.linked.has(g.key)).toBe(true)
	})
})

describe('worlds and removed pals', () => {
	const pal = (uid: string, game?: string): OwnedPal => ({ uid, palId: 'PinkCat', gender: 'F', passives: [], game })
	const base = sanitize({ owned: [pal('a', 'id:1'), pal('b', 'id:2'), pal('h')], wanted: [{ uid: 'w', palId: 'Anubis', passives: [] }], catches: { PinkCat: 3 } })

	it('keeps the lists already here for the first world, then keeps each world apart', () => {
		const first = withWorld(base, 'world-A|me', 'Friends Server')
		expect(first.owned).toHaveLength(3)
		expect(first.worldNames['world-A|me']).toBe('Friends Server')
		const second = withWorld({ ...first, catches: { PinkCat: 5 } }, '|' + '0'.repeat(31) + '1')
		expect(second.owned).toEqual([])
		expect(second.catches).toEqual({})
		expect(worldLabel(second.world!, second.worldNames)).toBe('Local Save')
		const back = withWorld({ ...second, owned: [pal('x')] }, 'world-A|me')
		expect(back.owned.map((o) => o.uid)).toEqual(['a', 'b', 'h'])
		expect(back.catches).toEqual({ PinkCat: 5 })
		expect(back.worlds['|' + '0'.repeat(31) + '1'].owned.map((o) => o.uid)).toEqual(['x'])
		// Saved and loaded, the other world comes along
		expect(sanitize(JSON.parse(JSON.stringify(back))).worlds['|' + '0'.repeat(31) + '1'].owned).toHaveLength(1)
	})

	it('moves gone pals to Recently Removed and brings them back when seen again', () => {
		const gone = withGamePresence(base, ['id:2'], ['id:1'])
		expect(gone.owned.map((o) => o.uid)).toEqual(['a', 'h'])
		expect(gone.removed.map((o) => o.uid)).toEqual(['b'])
		const back = withGamePresence(gone, [], ['id:1', 'id:2'])
		expect(back.owned.map((o) => o.uid).sort()).toEqual(['a', 'b', 'h'])
		expect(back.removed).toEqual([])
		expect(withGamePresence(back, [], ['id:1'])).toBe(back)
	})
})
