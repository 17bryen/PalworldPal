import { passiveFromGameId, type Gender } from '../data/gamedata'
import type { OwnedPal } from '../solver/types'
import { palIdFromGame } from './captures'
import type { PalStats } from '../data/expeditions'

/** One of your pals as the mod reports it: game ids for species and passives, gender 1 male, 2 female */
export interface RawGamePal {
	/** Mod 1.8+: the game's own id for the pal, the same for its whole life */
	id?: string
	c: string
	g: number
	p: string[]
	iv: number[]
	/** Mod 1.5+: party or box (1.8+: other, for yours at a base or in storage), and the slot index */
	in?: string
	s?: number
	/** Mod 1.6+: level, condensation rank (1 = no stars) and Pal Soul ranks for HP, attack, defense */
	lv?: number
	r?: number
	sr?: number[]
	/** Mod 1.7+: the pal's nickname, empty when it has none */
	n?: string
}

/**
 * Where a pal sits, e.g. "Party 4" or "Palbox 3:14" (page 3, slot 14); "other" is yours but
 * outside both, working at a base or in storage
 */
export type PalLocation = { box: 'party' | 'palbox' | 'other'; slot: number }

const PALBOX_PAGE = 30

export function describeLocation(where: PalLocation): string {
	if (where.box === 'party') return `Party ${where.slot + 1}`
	if (where.box === 'other') return 'Outside the Palbox (at a base or in storage)'
	return `Palbox ${Math.floor(where.slot / PALBOX_PAGE) + 1}:${(where.slot % PALBOX_PAGE) + 1}`
}

const BOXES: Record<string, PalLocation['box']> = { party: 'party', box: 'palbox', other: 'other' }
const NO_ID = '0'.repeat(32)

/** One of your pals in the game, in this app's terms */
export interface GamePal {
	/**
	 * Same pal, same key, across reads: the game's id for it when the mod sends one, otherwise
	 * `contentKey`
	 */
	key: string
	/** Species, gender, passives, IVs and alpha; identical twins get #2, #3... */
	contentKey: string
	palId: string
	gender: Gender
	/** In slot order */
	passives: string[]
	where?: PalLocation
	/** Mod 1.6+ */
	stats?: PalStats
	/** HP, attack and defense IVs */
	ivs: number[]
	alpha: boolean
	/** Mod 1.7+: the nickname the player gave it (up to 24 characters) */
	name?: string
}

/** Your pals from the mod's list, skipping humans and anything this app doesn't know */
export function normalizeGamePals(raw: RawGamePal[]): GamePal[] {
	const out: GamePal[] = []
	const keys = new Set<string>()
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
		const box = r.in ? BOXES[r.in] : undefined
		const where: PalLocation | undefined = typeof r.s === 'number' && r.s >= 0 && box ? { box, slot: r.s } : undefined
		const stats: PalStats | undefined =
			typeof r.lv === 'number' && r.lv > 0
				? {
						level: r.lv,
						stars: Math.max(0, Math.min(4, (r.r ?? 1) - 1)),
						ivs: [ivs[0] ?? 0, ivs[1] ?? 0, ivs[2] ?? 0],
						souls: [r.sr?.[0] ?? 0, r.sr?.[1] ?? 0, r.sr?.[2] ?? 0]
					}
				: undefined
		const name = typeof r.n === 'string' && r.n.trim() ? r.n.trim() : undefined
		const contentKey = n > 1 ? `${base}#${n}` : base
		const id = typeof r.id === 'string' && /^[0-9a-f]{32}$/.test(r.id) && r.id !== NO_ID ? r.id : undefined
		const key = id ? `id:${id}` : contentKey
		// The game can briefly hold two copies of a pal (while it's being moved, say); keep the first
		if (keys.has(key)) continue
		keys.add(key)
		out.push({ key, contentKey, palId, gender, passives, where, stats, ivs, alpha: /^boss_/i.test(r.c), name })
	}
	return out
}

/**
 * Where a synced pal is: its spot this session, else "Last Seen: ..." from an earlier one. Checking
 * that spot in the game loads it; if the pal isn't there, it was sold, condensed or moved.
 * Undefined for pals added by hand.
 */
export function ownedLocation(o: OwnedPal, current: Map<string, PalLocation | undefined>): string | undefined {
	if (!o.game) return undefined
	const now = current.get(o.game)
	if (now) return describeLocation(now)
	if (o.seen) return `Last Seen: ${describeLocation(o.seen)}`
	return 'Not seen in the game yet'
}

export interface GamePalChange {
	/** The key the pal had */
	from: string
	/** The same pal now */
	to: GamePal
}

/**
 * Pals whose key changed between two reads of the game because their gender, passives or IVs
 * changed (Surgery Table, fruits). Pals with the game's own id never change key; for the rest, a
 * changed pal is the one in the same slot with the same species and alpha status.
 */
export function diffGamePals(prev: GamePal[], next: GamePal[]): GamePalChange[] {
	const nextKeys = new Set(next.map((g) => g.key))
	const prevKeys = new Set(prev.map((g) => g.key))
	const appeared = next.filter((g) => !prevKeys.has(g.key) && g.where && !g.key.startsWith('id:'))
	const changes: GamePalChange[] = []
	for (const old of prev) {
		if (nextKeys.has(old.key) || !old.where || old.key.startsWith('id:')) continue
		const now = appeared.find(
			(g) => g.where!.box === old.where!.box && g.where!.slot === old.where!.slot && g.palId === old.palId && g.alpha === old.alpha
		)
		if (now) changes.push({ from: old.key, to: now })
	}
	return changes
}

/**
 * Pals that were in your party or Palbox and are now nowhere the game shows: sold, condensed,
 * released or traded. Only meaningful between two reads of the same game session, with the Palbox
 * loaded and the mod able to see pals you put at a base or in storage (they show as "other").
 */
export function goneKeys(prev: GamePal[], next: GamePal[], changes: GamePalChange[]): string[] {
	const present = new Set(next.map((g) => g.key))
	const changed = new Set(changes.map((c) => c.from))
	return prev.filter((g) => (g.where?.box === 'party' || g.where?.box === 'palbox') && !present.has(g.key) && !changed.has(g.key)).map((g) => g.key)
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
		// Entries synced before the game's ids came through still carry the older content key
		if (linked.has(gp.key) || linked.has(gp.contentKey)) {
			linked.add(gp.key)
			continue
		}
		const match = free.find((o) => !links.has(o.uid) && o.palId === gp.palId && o.gender === gp.gender && sameSet(o.passives, gp.passives))
		if (match) links.set(match.uid, gp.key)
		else adds.push(gp)
	}
	return { links, adds, linked }
}
