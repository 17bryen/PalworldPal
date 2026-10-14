import { passiveFromGameId, type Gender } from '../data/gamedata'
import type { OwnedPal } from '../solver/types'
import { palIdFromGame } from './captures'
import type { PalStats } from '../data/expeditions'

/** One of your pals as the mod reports it: game ids for species and passives, gender 1 male, 2 female */
export interface RawGamePal {
	c: string
	g: number
	p: string[]
	iv: number[]
	/** Mod 1.5+: party or box, and the slot index */
	in?: string
	s?: number
	/** Mod 1.6+: level, condensation rank (1 = no stars) and Pal Soul ranks for HP, attack, defense */
	lv?: number
	r?: number
	sr?: number[]
}

/** Where a pal sits, e.g. "Party 4" or "Palbox 3:14" (page 3, slot 14) */
export type PalLocation = { box: 'party' | 'palbox'; slot: number }

const PALBOX_PAGE = 30

export function describeLocation(where: PalLocation): string {
	if (where.box === 'party') return `Party ${where.slot + 1}`
	return `Palbox ${Math.floor(where.slot / PALBOX_PAGE) + 1}:${(where.slot % PALBOX_PAGE) + 1}`
}

/** A pal from your party or Palbox, in this app's terms */
export interface GamePal {
	/** Same pal, same key, across reads; identical twins get #2, #3... */
	key: string
	palId: string
	gender: Gender
	/** In slot order */
	passives: string[]
	where?: PalLocation
	/** Mod 1.6+ */
	stats?: PalStats
}

/** Your pals from the mod's list, skipping humans and anything this app doesn't know */
export function normalizeGamePals(raw: RawGamePal[]): GamePal[] {
	const out: GamePal[] = []
	const seen = new Map<string, number>()
	for (const r of raw) {
		const palId = palIdFromGame(r.c)
		if (!palId || (r.g !== 1 && r.g !== 2)) continue
		const gender: Gender = r.g === 1 ? 'M' : 'F'
		const passives = [...new Set(r.p.map((id) => passiveFromGameId(id)?.name).filter((n): n is string => !!n))]
		// Species, gender, passives and IVs together tell pals apart; levels change, so they're left out
		const ivs = r.iv.slice(0, 3).map((v) => Math.round(Number(v) || 0))
		const base = [palId, gender, [...passives].sort().join(','), ivs.join('/'), /^boss_/i.test(r.c) ? 'alpha' : ''].join('|')
		const n = (seen.get(base) ?? 0) + 1
		seen.set(base, n)
		const where: PalLocation | undefined =
			typeof r.s === 'number' && r.s >= 0 && (r.in === 'party' || r.in === 'box') ? { box: r.in === 'party' ? 'party' : 'palbox', slot: r.s } : undefined
		const stats: PalStats | undefined =
			typeof r.lv === 'number' && r.lv > 0
				? {
						level: r.lv,
						stars: Math.max(0, Math.min(4, (r.r ?? 1) - 1)),
						ivs: [ivs[0] ?? 0, ivs[1] ?? 0, ivs[2] ?? 0],
						souls: [r.sr?.[0] ?? 0, r.sr?.[1] ?? 0, r.sr?.[2] ?? 0]
					}
				: undefined
		out.push({ key: n > 1 ? `${base}#${n}` : base, palId, gender, passives, where, stats })
	}
	return out
}

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x))

export interface AddPlan {
	/** Pals typed in by hand that match a game pal; they get linked rather than added twice */
	links: Map<string, string>
	adds: GamePal[]
	/** Game pals already in My pals */
	linked: Set<string>
}

/** What adding these game pals to My pals would do */
export function planAdd(owned: OwnedPal[], gamePals: GamePal[]): AddPlan {
	const linked = new Set(owned.map((o) => o.game).filter((k): k is string => !!k))
	const free = owned.filter((o) => !o.game)
	const links = new Map<string, string>()
	const adds: GamePal[] = []
	for (const gp of gamePals) {
		if (linked.has(gp.key)) continue
		const match = free.find((o) => !links.has(o.uid) && o.palId === gp.palId && o.gender === gp.gender && sameSet(o.passives, gp.passives))
		if (match) links.set(match.uid, gp.key)
		else adds.push(gp)
	}
	return { links, adds, linked }
}
