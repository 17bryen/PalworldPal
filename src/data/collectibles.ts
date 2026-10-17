import { layerById, layerPoints, pixelToWorld, type MapIndex } from './map'

/** The game's effigy and journal classes (BP_LevelObject_<class>_C) and the map layer for each */
export const COLLECTIBLE_LAYERS: Record<string, string> = {
	Relic: 'lifmunk_effigy',
	Relic_FlameBambi: 'rooby_effigy',
	Relic_GuardianDog: 'yakumo_effigy',
	Relic_IceCrocodile: 'munchill_effigy',
	Relic_LazyDragon: 'relaxaurus_effigy',
	Relic_LeafMomonga: 'herbil_effigy',
	Relic_Monkey: 'tanzee_effigy',
	Relic_Mutant: 'lunaris_effigy',
	Relic_NegativeKoala: 'depresso_effigy',
	Relic_Penguin: 'pengullet_effigy',
	Relic_PinkCat: 'cattiva_effigy',
	Relic_SheepBall: 'lamball_effigy',
	Note: 'journals'
}

const collectibleLayerIds = new Set(Object.values(COLLECTIBLE_LAYERS))
export const isCollectibleLayer = (layerId: string) => collectibleLayerIds.has(layerId)

/** Map markers are rounded a little; the game's positions land within about 10 m of them */
const MATCH_RADIUS = 3000

let spots: Map<string, { key: string; x: number; y: number }[]> | null = null
function spotsOf(layerId: string) {
	if (!spots) {
		spots = new Map()
		for (const id of collectibleLayerIds) {
			const layer = layerById.get(id)
			if (!layer) continue
			const list: { key: string; x: number; y: number }[] = []
			for (const map of [0, 1] as MapIndex[]) for (const p of layerPoints(layer, map)) list.push({ key: p.key, ...pixelToWorld(map, p.px, p.py) })
			spots.set(id, list)
		}
	}
	return spots.get(layerId) ?? []
}

/** The map marker keys of collected effigies and journals, as the mod reports them (class and world position) */
export function collectedMarkerKeys(items: { c: string; x: number; y: number }[]): string[] {
	const keys: string[] = []
	for (const item of items) {
		const layerId = COLLECTIBLE_LAYERS[item.c]
		if (!layerId) continue
		let best: string | null = null
		let bestDistance = MATCH_RADIUS
		for (const s of spotsOf(layerId)) {
			const d = Math.hypot(s.x - item.x, s.y - item.y)
			if (d <= bestDistance) {
				bestDistance = d
				best = s.key
			}
		}
		if (best) keys.push(best)
	}
	return keys
}
