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

// World (Unreal) bounds of each map image; X points north, Y east
const WORLD_BOUNDS = [
	{ minX: -1099400, maxX: 349400, minY: -724400, maxY: 724400 },
	{ minX: 347351.5, maxX: 689148.5, minY: -818197, maxY: -476400 }
] as const

/** Which map and pixel a world position falls on; the World Tree is checked first because its edge overlaps the main map's ocean */
export function worldToPixel(x: number, y: number): { map: MapIndex; px: number; py: number } {
	const tree = WORLD_BOUNDS[1]
	const map: MapIndex = x >= tree.minX && x <= tree.maxX && y >= tree.minY && y <= tree.maxY ? 1 : 0
	const b = WORLD_BOUNDS[map]
	return { map, px: ((y - b.minY) / (b.maxY - b.minY)) * MAP_SIZE, py: ((b.maxX - x) / (b.maxX - b.minX)) * MAP_SIZE }
}

/** The world position (Unreal units, centimeters) of a pixel on a map image */
export function pixelToWorld(map: MapIndex, px: number, py: number): { x: number; y: number } {
	const b = WORLD_BOUNDS[map]
	return { x: b.maxX - (py / MAP_SIZE) * (b.maxX - b.minX), y: b.minY + (px / MAP_SIZE) * (b.maxY - b.minY) }
}

/** In-game map coordinates (as the game shows them) for a pixel on a map image */
export function pixelToIngame(map: MapIndex, px: number, py: number): [number, number] {
	const c = MAPS[map].ingame
	return [c.x0 + (px / MAP_SIZE) * c.span, c.y0 + (1 - py / MAP_SIZE) * c.span]
}

/** Points of one layer on one map */
export interface LayerPoint {
	/** Stable id for this spot, e.g. "junk:12" */
	key: string
	px: number
	py: number
	label?: string
}

export function layerPoints(layer: MapLayer, map: MapIndex): LayerPoint[] {
	const out: LayerPoint[] = []
	for (let i = 0; i < layer.points.length; i += 3) {
		if (layer.points[i] !== map) continue
		out.push({ key: `${layer.id}:${i / 3}`, px: layer.points[i + 1], py: layer.points[i + 2], label: layer.labels?.[i / 3] || undefined })
	}
	return out
}

/**
 * Lootable spots that come back after a while, with default minutes until they do. Junk piles'
 * 300 comes from the game data; chest and crate timers vary by source and server settings, so
 * these are editable.
 */
export const LOOT_DEFAULT_MINUTES: Record<string, number> = { junk: 300, chest: 240, chest_element: 240, supply: 240, dungeon: 30 }
export const isLootLayer = (layerId: string) => layerId in LOOT_DEFAULT_MINUTES

/**
 * Marked by clicking only: walking past a dungeon entrance doesn't mean you cleared it. Dungeons
 * open at random spots for a while, so 30 minutes is a rough guess.
 */
export const CLICK_ONLY_LOOT = new Set(['dungeon'])

let lootSpots: { key: string; map: MapIndex; x: number; y: number }[] | null = null
/** Every lootable spot in world units, for standing-on-it detection */
export function allLootSpots() {
	if (!lootSpots) {
		lootSpots = []
		for (const layer of mapLayers) {
			if (!isLootLayer(layer.id) || CLICK_ONLY_LOOT.has(layer.id)) continue
			for (const map of [0, 1] as MapIndex[]) {
				for (const p of layerPoints(layer, map)) lootSpots.push({ key: p.key, map, ...pixelToWorld(map, p.px, p.py) })
			}
		}
	}
	return lootSpots
}
