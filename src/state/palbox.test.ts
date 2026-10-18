import { describe, expect, it } from 'vitest'
import type { OwnedPal } from '../solver/types'
import type { GamePal } from './gamepals'
import { buildBox, emptyFilter, filterActive, matchesFilter } from './palbox'

const game = (key: string, palId: string, box: 'party' | 'palbox' | 'other', slot: number, extra: Partial<GamePal> = {}): GamePal => ({
	key,
	contentKey: key,
	palId,
	gender: 'M',
	passives: [],
	where: { box, slot },
	ivs: [0, 0, 0],
	alpha: false,
	...extra
})
const saved = (game: string, palId: string, box: 'party' | 'palbox' | 'other', slot: number, extra: Partial<OwnedPal> = {}): OwnedPal => ({
	uid: `u-${game}`,
	palId,
	gender: 'F',
	passives: [],
	game,
	seen: { box, slot },
	...extra
})

describe('palbox layout', () => {
	it('puts pals in their party and page slots', () => {
		const view = buildBox([], [game('a', 'SheepBall', 'party', 2), game('b', 'Kitsunebi', 'palbox', 31), game('c', 'Anubis', 'other', 0)], new Set(['a']))
		expect(view.party[2]?.key).toBe('a')
		expect(view.party[2]?.added).toBe(true)
		// Slot 31 is page 2, slot 2
		expect(view.pages[1][1]?.key).toBe('b')
		expect(view.pages[1][1]?.added).toBe(false)
		expect(view.outside.map((p) => p.key)).toEqual(['c'])
		expect(view.all.map((p) => p.key)).toEqual(['a', 'b', 'c'])
		expect(view.stale.size).toBe(0)
	})

	it('keeps last session pals on pages the game has not shown again, and marks those pages', () => {
		const owned = [saved('old1', 'SheepBall', 'palbox', 0), saved('old2', 'Kitsunebi', 'palbox', 65), saved('old3', 'Anubis', 'party', 0)]
		// This session the game showed page 1 and the party, but not page 3
		const view = buildBox(owned, [game('new', 'PinkCat', 'palbox', 4), game('p', 'Anubis', 'party', 1)], new Set())
		// old1 was on page 1, which the game has shown since without it: it moved on
		expect(view.pages[0][0]).toBeNull()
		expect(view.pages[0][4]?.key).toBe('new')
		expect(view.pages[2][5]?.key).toBe('old2')
		expect(view.pages[2][5]?.live).toBe(false)
		expect([...view.stale]).toEqual([2])
		// The party was shown this session, so the old party pal is left out too
		expect(view.party[0]).toBeNull()
		expect(view.party[1]?.key).toBe('p')
	})

	it('shows the last sync without marking pages while the game is not connected', () => {
		const view = buildBox([saved('old', 'SheepBall', 'palbox', 40)], [], new Set())
		expect(view.pages[1][10]?.key).toBe('old')
		expect(view.stale.size).toBe(0)
	})

	it('lists each pal once, even when the game or My Pals repeats one', () => {
		const pal = game('a', 'SheepBall', 'palbox', 3)
		const view = buildBox([saved('b', 'Anubis', 'palbox', 40), saved('b', 'Anubis', 'palbox', 41)], [pal, { ...pal }], new Set())
		expect(view.all.map((p) => p.key)).toEqual(['a', 'b'])
	})

	it('ignores hand-added pals', () => {
		const view = buildBox([{ uid: 'h', palId: 'SheepBall', gender: 'M', passives: [] }], [], new Set())
		expect(view.all).toEqual([])
	})
})

describe('palbox filter', () => {
	const pal = buildBox([], [game('a', 'Kitsunebi', 'palbox', 0, { name: 'Sparky', gender: 'F', passives: ['Lucky', 'Swift'] })], new Set()).all[0]

	it('matches species, nickname, type, work, gender and passives together', () => {
		expect(filterActive(emptyFilter)).toBe(false)
		expect(matchesFilter(pal, { ...emptyFilter, text: 'foxp' })).toBe(true)
		expect(matchesFilter(pal, { ...emptyFilter, text: 'spark' })).toBe(true)
		expect(matchesFilter(pal, { ...emptyFilter, element: 'Fire', work: 'kindling', gender: 'F', passives: ['Lucky'] })).toBe(true)
		expect(matchesFilter(pal, { ...emptyFilter, element: 'Water' })).toBe(false)
		expect(matchesFilter(pal, { ...emptyFilter, work: 'mining' })).toBe(false)
		expect(matchesFilter(pal, { ...emptyFilter, gender: 'M' })).toBe(false)
		expect(matchesFilter(pal, { ...emptyFilter, passives: ['Lucky', 'Legend'] })).toBe(false)
	})
})
