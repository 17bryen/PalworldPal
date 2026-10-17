import { getPal, type Gender, type WorkKind } from '../data/gamedata'
import { palElements, type PalStats } from '../data/expeditions'
import type { OwnedPal } from '../solver/types'
import type { GamePal, PalLocation } from './gamepals'

// The Palbox as the game lays it out: a party of 5, then 32 pages of 6 x 5 slots
export const PARTY_SLOTS = 5
export const PAGE_COLUMNS = 6
export const PAGE_SLOTS = 30
export const PAGE_COUNT = 32

/** A synced pal in the Palbox tab, from this session's game read or the last one saved */
export interface BoxPal {
	/** The game's key for it (GamePal.key / OwnedPal.game) */
	key: string
	palId: string
	gender: Gender
	passives: string[]
	level?: number
	/** Level, condensation stars, IVs and Pal Soul ranks, when the mod reported them */
	stats?: PalStats
	/** Its nickname */
	name?: string
	alpha: boolean
	where?: PalLocation
	/** Seen in the game this session, rather than kept from an earlier one */
	live: boolean
	/** In My Pals (pals seen this session may not be added yet) */
	added: boolean
}

export interface BoxView {
	party: (BoxPal | null)[]
	pages: (BoxPal | null)[][]
	/** Pages showing pals from an earlier session while the game is connected: opening them in the game syncs them */
	stale: Set<number>
	/** Synced pals last seen outside the party and Palbox */
	outside: BoxPal[]
	/** Every pal above, party first, then page by page, then outside */
	all: BoxPal[]
}

export const pageOf = (slot: number) => Math.floor(slot / PAGE_SLOTS)

/**
 * Lays synced pals out the way the game shows them. Pals the game showed this session sit where it
 * showed them; the rest sit where they were last seen, unless the game has since shown that page
 * (or the party), in which case they've moved on and are left out.
 */
export function buildBox(owned: OwnedPal[], gamePals: GamePal[], added: Set<string>): BoxView {
	const party: (BoxPal | null)[] = Array(PARTY_SLOTS).fill(null)
	const pages: (BoxPal | null)[][] = Array.from({ length: PAGE_COUNT }, () => Array(PAGE_SLOTS).fill(null))
	const outside: BoxPal[] = []
	const place = (p: BoxPal): boolean => {
		const w = p.where
		if (w?.box === 'party' && w.slot < PARTY_SLOTS && !party[w.slot]) return !!(party[w.slot] = p)
		if (w?.box === 'palbox' && pageOf(w.slot) < PAGE_COUNT) {
			const page = pages[pageOf(w.slot)]
			if (!page[w.slot % PAGE_SLOTS]) return !!(page[w.slot % PAGE_SLOTS] = p)
		}
		return false
	}

	const liveKeys = new Set<string>()
	const livePages = new Set<number>()
	let liveParty = false
	for (const g of gamePals) {
		liveKeys.add(g.key)
		if (g.where?.box === 'palbox') livePages.add(pageOf(g.where.slot))
		if (g.where?.box === 'party') liveParty = true
		const p: BoxPal = { key: g.key, palId: g.palId, gender: g.gender, passives: g.passives, level: g.stats?.level, stats: g.stats, name: g.name, alpha: g.alpha, where: g.where, live: true, added: added.has(g.key) }
		if (!place(p)) outside.push(p)
	}

	const stale = new Set<number>()
	for (const o of owned) {
		if (!o.game || liveKeys.has(o.game)) continue
		const w = o.seen
		// Moved on: the game has shown its page (or the party) this session without it
		if (w?.box === 'palbox' && livePages.has(pageOf(w.slot))) continue
		if (w?.box === 'party' && liveParty) continue
		const p: BoxPal = { key: o.game, palId: o.palId, gender: o.gender, passives: o.passives, level: o.stats?.level, stats: o.stats, name: o.name, alpha: false, where: w, live: false, added: true }
		if (place(p)) {
			if (gamePals.length && w?.box === 'palbox') stale.add(pageOf(w.slot))
		} else outside.push(p)
	}

	const all = [...party, ...pages.flat(), ...outside].filter((p): p is BoxPal => !!p)
	return { party, pages, stale, outside, all }
}

export interface BoxFilter {
	/** Species or nickname */
	text: string
	element: string | null
	work: WorkKind | null
	/** Has every one of these */
	passives: string[]
	gender: Gender | null
}

export const emptyFilter: BoxFilter = { text: '', element: null, work: null, passives: [], gender: null }

export const filterActive = (f: BoxFilter) => !!f.text.trim() || !!f.element || !!f.work || f.passives.length > 0 || !!f.gender

export function matchesFilter(p: BoxPal, f: BoxFilter): boolean {
	const q = f.text.trim().toLowerCase()
	if (q && !getPal(p.palId).name.toLowerCase().includes(q) && !p.name?.toLowerCase().includes(q)) return false
	if (f.element && !palElements(p.palId).includes(f.element)) return false
	if (f.work && !(getPal(p.palId).work[f.work] > 0)) return false
	if (f.gender && p.gender !== f.gender) return false
	return f.passives.every((name) => p.passives.includes(name))
}
