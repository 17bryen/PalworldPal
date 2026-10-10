// Where each pal spawns in the wild. Built from paldb.cc's datamined spawners and the game's
// Paldeck habitat table (site data v1.0.5, 2026-09-15): field spawns, alphas and fishing spots,
// but not raids, dungeons, events or merchants. Regions follow the tower areas plus the three
// Wildlife Sanctuaries. Rebuild by hand after big content patches.
import raw from './spawns.json'
import { getPal } from './gamedata'

export interface Region {
	key: string
	name: string
	wildLevel: [number, number]
}

const { _regions: regionInfo, ...palRegions } = raw as unknown as Record<string, string[]> & {
	_regions: Record<string, { name: string; wildLevel: [number, number] }>
}

/** Highest level first, the order the map opens up in reverse */
export const REGIONS: Region[] = Object.entries(regionInfo)
	.map(([key, r]) => ({ key, name: r.name, wildLevel: r.wildLevel }))
	.sort((a, b) => b.wildLevel[0] - a.wildLevel[0] || b.wildLevel[1] - a.wildLevel[1])

/** Pals the game lists as wild but with no mapped field spawn (dungeons, events, gaps in the data) */
export const OTHER_REGION: Region = { key: 'other', name: 'Other spawns', wildLevel: [0, 0] }

export const regionName = (key: string) => (key === OTHER_REGION.key ? OTHER_REGION.name : regionInfo[key]?.name ?? key)

/** Regions a pal spawns in, lowest level first; empty when it can't be caught in the wild */
export function spawnRegions(palId: string): string[] {
	const regions = palRegions[palId]
	if (regions?.length) return regions
	return getPal(palId).wild ? [OTHER_REGION.key] : []
}

export type WorldTreePresence = 'only' | 'also'

export const worldTree = new Map<string, WorldTreePresence>(
	Object.entries(palRegions)
		.filter(([, regions]) => regions.includes('worldTree'))
		.map(([id, regions]) => [id, regions.length === 1 ? 'only' : 'also'])
)
