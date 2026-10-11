// Map markers and pal habitats. Marker layers come from paldb.cc's map data (site data v1.0.5,
// 2026-09-15); habitats from the game's Paldeck distribution table, thinned to a grid. Positions are
// pixels on an 8192 x 8192 image of each map. Tiles in public/map come from `npm run icons`.
import layersRaw from './maplayers.json'
import habitatRaw from './palhabitat.json'

export const MAP_SIZE = 8192
export type MapIndex = 0 | 1

export const MAPS = [
	// In-game coordinates at the image's left and bottom edges, and how many they span
	{ index: 0, key: 'main', name: 'Palpagos Islands', ingame: { x0: -1922.4401, y0: -2125.2985, span: 3156.427 } },
	{ index: 1, key: 'worldTree', name: 'World Tree', ingame: { x0: -127.7, y0: 648.7, span: 256 } }
] as const

export interface MapLayer {
	id: string
	name: string
	category: string
	/** Icon file name in public/map/icons */
	icon: string | null
	/** Candidate spots for something that appears at one of them at a time */
	random?: boolean
	/** Flat [map, px, py, map, px, py, ...] */
	points: number[]
	labels?: string[]
}

export const mapLayers = (layersRaw as unknown as { layers: MapLayer[] }).layers
export const layerById = new Map(mapLayers.map((l) => [l.id, l]))

/** Per pal, flat [map, px, py, flags, ...]; flags are HABITAT bits */
export const palHabitat = habitatRaw as unknown as Record<string, number[]>
export const HABITAT = { DAY: 1, NIGHT: 2, ALPHA: 4 }

export const CATEGORY_ORDER = ['Collectibles', 'Resource', 'Eggs', 'Fishing', 'Locations', 'Enemies', 'NPCs', 'Mine', 'Oilrig', 'Other']
export const CATEGORY_NAMES: Record<string, string> = {
	Resource: 'Loot',
	Mine: 'Mining',
	Oilrig: 'Oil rig',
	Fishing: 'Fishing and salvage'
}

/** In-game map coordinates (as the game shows them) for a pixel on a map image */
export function pixelToIngame(map: MapIndex, px: number, py: number): [number, number] {
	const c = MAPS[map].ingame
	return [c.x0 + (px / MAP_SIZE) * c.span, c.y0 + (1 - py / MAP_SIZE) * c.span]
}

/** Points of one layer on one map */
export function layerPoints(layer: MapLayer, map: MapIndex): { px: number; py: number; label?: string }[] {
	const out: { px: number; py: number; label?: string }[] = []
	for (let i = 0; i < layer.points.length; i += 3) {
		if (layer.points[i] !== map) continue
		out.push({ px: layer.points[i + 1], py: layer.points[i + 2], label: layer.labels?.[i / 3] || undefined })
	}
	return out
}
