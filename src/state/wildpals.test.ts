import { describe, expect, it } from 'vitest'
import { parseWild } from '../../electron/gamelink'
import { worldToPixel } from '../data/map'
import { groupWildPals, normalizeWildPals, type WildPal } from './wildpals'

const at = (x: number, y: number) => worldToPixel(x, y)

describe('wild pals', () => {
	it('reads wild.json and drops malformed entries', () => {
		const text = '{"v":1,"mod":"1.9.0","pals":[{"c":"SheepBall","x":1,"y":2,"z":3,"lv":5,"g":1},{"c":"PinkCat","x":"1"},{"x":1,"y":2,"z":3}]}'
		expect(parseWild(text, 7)).toEqual({ pals: [{ c: 'SheepBall', x: 1, y: 2, z: 3, lv: 5, g: 1 }], mod: '1.9.0', at: 7 })
		expect(parseWild('{"pals":[{"c":"Sh', 7)).toBeNull()
	})

	it('maps game ids to pals, keeping alphas and lucky pals, skipping humans', () => {
		const pals = normalizeWildPals([
			{ c: 'BOSS_Kitsunebi', x: -346618, y: 191707, z: 0, lv: 20 },
			{ c: 'Sheepball', x: -346618, y: 191707, z: 0, l: true },
			{ c: 'Male_DarkTrader01', x: 0, y: 0, z: 0 }
		])
		expect(pals.map((p) => [p.palId, p.alpha, p.lucky, p.level])).toEqual([
			['Kitsunebi', true, false, 20],
			['SheepBall', false, true, 0]
		])
		expect(pals[0]).toMatchObject(at(-346618, 191707))
		expect(pals[0].map).toBe(0)
	})

	it('groups a species close together, but never alphas or lucky pals', () => {
		const pal = (palId: string, px: number, level = 1, extra: Partial<WildPal> = {}): WildPal => ({ palId, map: 0, px, py: 100, level, alpha: false, lucky: false, ...extra })
		const groups = groupWildPals(
			[
				pal('SheepBall', 100, 3),
				pal('SheepBall', 104, 7),
				pal('SheepBall', 200),
				pal('Kitsunebi', 102),
				pal('SheepBall', 101, 9, { alpha: true }),
				pal('SheepBall', 103, 9, { lucky: true }),
				{ ...pal('SheepBall', 100), map: 1 }
			],
			0,
			10
		)
		expect(groups.map((g) => [g.palId, g.count, g.px, g.alpha, g.lucky, g.minLevel, g.maxLevel])).toEqual([
			['SheepBall', 2, 102, false, false, 3, 7],
			['SheepBall', 1, 200, false, false, 1, 1],
			['Kitsunebi', 1, 102, false, false, 1, 1],
			['SheepBall', 1, 101, true, false, 9, 9],
			['SheepBall', 1, 103, false, true, 9, 9]
		])
	})
})
