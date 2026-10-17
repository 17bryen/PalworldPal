import { describe, expect, it } from 'vitest'
import { parseCaptures, parseLive } from '../../electron/gamelink'
import { normalizeCaptures } from './captures'
import { worldToPixel, pixelToIngame } from '../data/map'
import { Motion } from './motion'
import { lootReadyAt, sanitize } from './store'
import { allLootSpots } from '../data/map'

describe('bridge files', () => {
	it('reads live.json and rejects partial writes', () => {
		expect(parseLive('{"v":1,"mod":"1.1.0","seq":4,"x":-346618.0,"y":191707.0,"z":12.5,"yaw":-90.0,"ui":true}', 1)).toEqual({
			x: -346618,
			y: 191707,
			z: 12.5,
			yaw: -90,
			ui: true,
			mod: '1.1.0',
			at: 1
		})
		// Files from the first mod version have no menu flag
		expect(parseLive('{"v":1,"mod":"1.0.0","seq":1,"x":1,"y":2,"z":3,"yaw":4}', 1)?.ui).toBe(false)
		expect(parseLive('{"v":1,"x":-3466', 1)).toBeNull()
		expect(parseLive('', 1)).toBeNull()
	})

	it('reads captures.json', () => {
		expect(parseCaptures('{"v":1,"mod":"1.0.0","counts":{"SheepBall":3,"PinkCat":1}}', 2)?.counts).toEqual({ SheepBall: 3, PinkCat: 1 })
		expect(parseCaptures('{"v":1,"counts":', 2)).toBeNull()
	})

	it('maps capture keys to pal ids, folding alphas into their species', () => {
		expect(normalizeCaptures({ SheepBall: 3, BOSS_SheepBall: 1, sheepball: 1, NotAPal: 9, PinkCat: 0 })).toEqual({ SheepBall: 5 })
	})
})

describe('world to map', () => {
	it('places a known fast travel point at its in-game coordinates', () => {
		// Small Settlement fast travel point, shown in game at about 73, -485
		const p = worldToPixel(-346618, 191707)
		expect(p.map).toBe(0)
		const [x, y] = pixelToIngame(p.map, p.px, p.py)
		expect(Math.round(x)).toBe(73)
		expect(Math.round(y)).toBe(-485)
	})

	it('puts World Tree positions on the World Tree map', () => {
		expect(worldToPixel(500000, -650000).map).toBe(1)
	})
})

describe('motion playback', () => {
	it('blends between updates a fixed delay behind, timed by the mod clock', () => {
		const m = new Motion()
		// Updates 50 ms apart on the mod clock, delivered with uneven delays
		m.push({ x: 0, y: 0, yaw: 0, t: 10.0 }, 1000)
		m.push({ x: 100, y: 0, yaw: 10, t: 10.05 }, 1080)
		m.push({ x: 200, y: 0, yaw: 20, t: 10.1 }, 1105)
		// Offset is 1000 ms (fastest delivery); 90 ms behind 1165 is mod time 10.075
		expect(m.at(1165)!.x).toBeCloseTo(150)
	})

	it('keeps facing current instead of delayed, turning the short way across north', () => {
		const m = new Motion()
		m.push({ x: 0, y: 0, yaw: 170 }, 0)
		m.push({ x: 0, y: 0, yaw: -170 }, 100)
		m.at(100)
		// Settles on the newest facing (190 = -170 the short way) plus a little of the turn ahead
		const yaw = m.at(400)!.yaw
		expect(yaw).toBeGreaterThan(189)
		expect(yaw).toBeLessThan(207)
	})
})

describe('loot timers', () => {
	const loot = { auto: true, grey: true, minutes: { junk: 300, chest: 240 }, looted: { 'junk:4': 1_000_000, 'chest:9': 1_000_000 } }

	it('knows when each looted spot comes back', () => {
		expect(lootReadyAt('junk:4', loot, 1_000_000 + 60_000)).toBe(1_000_000 + 300 * 60_000)
		expect(lootReadyAt('chest:9', loot, 1_000_000 + 239 * 60_000)).toBe(1_000_000 + 240 * 60_000)
		// Timer ran out, or never looted
		expect(lootReadyAt('chest:9', loot, 1_000_000 + 241 * 60_000)).toBeNull()
		expect(lootReadyAt('junk:5', loot, 1_000_000)).toBeNull()
	})

	it('times cleared dungeons but never marks them from standing nearby', () => {
		const cleared = sanitize({ loot: { auto: true, looted: { 'dungeon:12': Date.now() } } }).loot
		expect(cleared.minutes.dungeon).toBe(30)
		expect(lootReadyAt('dungeon:12', cleared)).not.toBeNull()
		expect(allLootSpots().some((s) => s.key.startsWith('dungeon:'))).toBe(false)
	})

	it('gives every lootable spot a stable id', () => {
		const spots = allLootSpots()
		expect(spots.length).toBeGreaterThan(2000)
		expect(new Set(spots.map((s) => s.key)).size).toBe(spots.length)
	})
})
