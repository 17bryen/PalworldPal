import { worldToPixel, type MapIndex } from '../data/map'
import { palIdFromGame } from './captures'

/** A wild pal as the mod reports it: the game's species id (alphas keep BOSS_), world position, level, gender, lucky */
export interface RawWildPal {
	c: string
	x: number
	y: number
	z: number
	lv?: number
	g?: number
	l?: boolean
}

export interface WildPal {
	palId: string
	map: MapIndex
	px: number
	py: number
	level: number
	alpha: boolean
	lucky: boolean
}

/** The mod's wild pals on the map images, skipping humans and anything this app doesn't know */
export function normalizeWildPals(raw: RawWildPal[]): WildPal[] {
	const out: WildPal[] = []
	for (const r of raw) {
		const palId = palIdFromGame(r.c)
		if (!palId || !Number.isFinite(r.x) || !Number.isFinite(r.y)) continue
		const { map, px, py } = worldToPixel(r.x, r.y)
		out.push({ palId, map, px, py, level: typeof r.lv === 'number' ? r.lv : 0, alpha: /^boss_/i.test(r.c), lucky: r.l === true })
	}
	return out
}

/** Pals of one species close together, drawn as one portrait */
export interface WildGroup {
	palId: string
	px: number
	py: number
	count: number
	alpha: boolean
	lucky: boolean
	minLevel: number
	maxLevel: number
}

/**
 * Groups pals of the same species that sit within `radius` image pixels of a group's middle.
 * Alphas and lucky pals always get their own portrait, so they're never hidden in a herd.
 */
export function groupWildPals(list: WildPal[], map: MapIndex, radius: number): WildGroup[] {
	const groups: (WildGroup & { sx: number; sy: number })[] = []
	for (const p of list) {
		if (p.map !== map) continue
		const special = p.alpha || p.lucky
		const near = special
			? undefined
			: groups.find((g) => g.palId === p.palId && !g.alpha && !g.lucky && Math.hypot(g.px - p.px, g.py - p.py) <= radius)
		if (near) {
			near.count++
			near.sx += p.px
			near.sy += p.py
			near.px = near.sx / near.count
			near.py = near.sy / near.count
			near.minLevel = Math.min(near.minLevel, p.level)
			near.maxLevel = Math.max(near.maxLevel, p.level)
		} else {
			groups.push({ palId: p.palId, px: p.px, py: p.py, sx: p.px, sy: p.py, count: 1, alpha: p.alpha, lucky: p.lucky, minLevel: p.level, maxLevel: p.level })
		}
	}
	return groups.map(({ sx: _sx, sy: _sy, ...g }) => g)
}
