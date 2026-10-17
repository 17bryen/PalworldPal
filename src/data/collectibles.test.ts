import { describe, expect, it } from 'vitest'
import { collectedMarkerKeys, COLLECTIBLE_LAYERS, isCollectibleLayer } from './collectibles'
import { layerById, layerPoints, pixelToWorld } from './map'
import { sanitize, withWorld } from '../state/store'

describe('collected effigies', () => {
	it('knows a map layer for every effigy and journal class', () => {
		for (const id of Object.values(COLLECTIBLE_LAYERS)) expect(layerById.get(id), id).toBeTruthy()
		expect(isCollectibleLayer('journals')).toBe(true)
		expect(isCollectibleLayer('chest')).toBe(false)
	})

	it('matches the game positions to the nearest marker of the same kind', () => {
		const layer = layerById.get('pengullet_effigy')!
		const p = layerPoints(layer, 0)[3]
		const w = pixelToWorld(0, p.px, p.py)
		// A few meters off, as the game's positions are, and an unknown class and a stray position ignored
		const keys = collectedMarkerKeys([
			{ c: 'Relic_Penguin', x: w.x + 400, y: w.y - 300 },
			{ c: 'Relic_Unknown', x: w.x, y: w.y },
			{ c: 'Relic_Penguin', x: w.x + 500000, y: w.y }
		])
		expect(keys).toEqual([p.key])
		// The same spot as a Lifmunk Effigy would be a different marker, or none
		expect(collectedMarkerKeys([{ c: 'Relic', x: w.x, y: w.y }])).not.toContain(p.key)
	})

	it('keeps each world its own collected effigies', () => {
		const a = { ...sanitize({}), world: 'server-a', collected: { 'lifmunk_effigy:3': 1 } }
		const b = withWorld(a, 'server-b')
		expect(b.collected).toEqual({})
		expect(withWorld(b, 'server-a').collected).toEqual({ 'lifmunk_effigy:3': 1 })
		// Saves from before this keep loading
		expect(sanitize({ worlds: { old: { owned: [], wanted: [], catches: {}, looted: {}, removed: [] } } } as never).worlds.old.collected).toEqual({})
	})
})
