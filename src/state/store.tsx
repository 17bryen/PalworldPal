import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { getPal } from '../data/gamedata'
import { LOOT_DEFAULT_MINUTES } from '../data/map'
import type { CatchPref, OwnedPal, Pin, PlanSettings, WantedPal } from '../solver/types'
import { planAdd, type GamePal, type GamePalChange } from './gamepals'
import { defaultSurgery } from '../data/surgery'
import { DEFAULT_BASIC, entryKey, getRecipe, type ChecklistEntry } from '../data/recipes'

declare global {
	interface Window {
		palStore?: {
			load(): Promise<string | null>
			save(json: string): Promise<void>
			saveNow(json: string): void
			onChanged(cb: (json: string) => void): () => void
		}
	}
}

export interface AppState {
	version: 1
	owned: OwnedPal[]
	wanted: WantedPal[]
	settings: PlanSettings
	/** Paldeck catches per pal, tracked by hand */
	catches: Record<string, number>
	map: MapPrefs
	/** Take Paldeck catches from the game while the bridge mod is running */
	syncCatches: boolean
	overlay: OverlayPrefs
	loot: LootState
	/** Synced pals that left the party and Palbox and turned up nowhere else; restored if seen again */
	removed: RemovedPal[]
	/** The world (save or server) the lists above belong to; set by the game link */
	world: string | null
	/** Every other world's lists, kept while another is open */
	worlds: Record<string, WorldData>
	worldNames: Record<string, string>
	craft: CraftState
}

/** The Recipes tab's checklist, and which craftable materials to stop at instead of breaking down */
export interface CraftState {
	list: ChecklistEntry[]
	basic: string[]
	/** How many of each checklist row you already have, by checklist key */
	have: Record<string, number>
}

export const defaultCraft: CraftState = { list: [], basic: DEFAULT_BASIC, have: {} }

export type RemovedPal = OwnedPal & { removedAt: number }

/** What belongs to one world (save or server) rather than to the app */
export interface WorldData {
	owned: OwnedPal[]
	wanted: WantedPal[]
	catches: Record<string, number>
	looted: Record<string, number>
	removed: RemovedPal[]
}

const MAX_REMOVED = 200
const LOCAL_HOST_ID = '0'.repeat(31) + '1'

/** A world's name: what the game calls it, what the player renamed it to, or what kind it is */
export function worldLabel(id: string, names: Record<string, string>): string {
	if (names[id]) return names[id]
	// A local host always has the same player id; anyone on a server has their own
	return id.endsWith(`|${LOCAL_HOST_ID}`) ? 'Local Save' : 'Server'
}

const worldOf = (s: AppState): WorldData => ({ owned: s.owned, wanted: s.wanted, catches: s.catches, looted: s.loot.looted, removed: s.removed })
const emptyWorld: WorldData = { owned: [], wanted: [], catches: {}, looted: {}, removed: [] }

/**
 * Moves synced pals that left for good (sold, condensed, traded) to Recently Removed, and brings
 * back removed ones the game shows again
 */
export function withGamePresence(s: AppState, gone: string[], present: string[]): AppState {
	const goneSet = new Set(gone)
	const presentSet = new Set(present)
	const leaving = s.owned.filter((o) => o.game && goneSet.has(o.game))
	const returning = s.removed.filter((r) => r.game && presentSet.has(r.game))
	if (!leaving.length && !returning.length) return s
	const now = Date.now()
	return {
		...s,
		owned: [...s.owned.filter((o) => !leaving.includes(o)), ...returning.map(({ removedAt: _, ...o }) => o)],
		removed: [...leaving.map((o) => ({ ...o, removedAt: now })), ...s.removed.filter((r) => !returning.includes(r))].slice(0, MAX_REMOVED)
	}
}

/**
 * Opens a world's lists (each save or server keeps its own pals, targets, catches and loot
 * timers). The first world seen keeps the lists already here.
 */
export function withWorld(s: AppState, id: string, name?: string): AppState {
	const worldNames = name && !s.worldNames[id] ? { ...s.worldNames, [id]: name } : s.worldNames
	if (s.world === id) return worldNames === s.worldNames ? s : { ...s, worldNames }
	if (!s.world) return { ...s, world: id, worldNames }
	const worlds = { ...s.worlds, [s.world]: worldOf(s) }
	const next = worlds[id] ?? emptyWorld
	delete worlds[id]
	return {
		...s,
		owned: next.owned,
		wanted: next.wanted,
		catches: next.catches,
		removed: next.removed,
		loot: { ...s.loot, looted: next.looted },
		world: id,
		worlds,
		worldNames
	}
}

export interface LootState {
	/** Mark a spot looted after standing on it for a moment */
	auto: boolean
	/** Minutes until each lootable marker type comes back */
	minutes: Record<string, number>
	/** When each spot was looted (ms since epoch), by spot key */
	looted: Record<string, number>
}

const defaultLoot: LootState = { auto: true, minutes: { ...LOOT_DEFAULT_MINUTES }, looted: {} }

/** When a looted spot comes back (ms since epoch), or null when it's ready now */
export function lootReadyAt(key: string, loot: LootState, now = Date.now()): number | null {
	const at = loot.looted[key]
	if (at == null) return null
	const ready = at + (loot.minutes[key.slice(0, key.indexOf(':'))] ?? 0) * 60000
	return ready > now ? ready : null
}

/** Where the compass and minimap sit, as fractions of the screen so it survives resolution changes */
export interface OverlayLayout {
	/** Compass center */
	compassX: number
	compassY: number
	/** Compass width in pixels */
	compassWidth: number
	/** Minimap top-left; null puts it in the top-right corner */
	minimapX: number | null
	minimapY: number | null
	/** Minimap diameter in pixels */
	size: number
}

export const defaultLayout: OverlayLayout = { compassX: 0.5, compassY: 0.012, compassWidth: 720, minimapX: null, minimapY: null, size: 240 }

export interface OverlayPrefs extends OverlayLayout {
	/** Shown over the game (also toggled by the hotkey) */
	enabled: boolean
	compass: boolean
	/** Compass parts; with all three off, only the marker icons show (e.g. over the game's own compass) */
	compassBar: boolean
	compassTicks: boolean
	compassLetters: boolean
	minimap: boolean
	/** Display to cover; null for the primary display */
	display: number | null
	/** Minimap zoom, same scale as the Map tab */
	zoom: number
	/** Compass shows markers within this many meters; 0 means no limit */
	range: number
	/** Wild pals loaded near you on the minimap */
	wildPals: boolean
}

export const COMPASS_DEFAULT_RANGE = 200
/** Range choices in meters; 0 is unlimited (JSON can't store Infinity) */
export const COMPASS_RANGES = [50, 100, 150, 200, 300, 500, 0]

const defaultOverlay: OverlayPrefs = { ...defaultLayout, enabled: false, compass: true, compassBar: true, compassTicks: true, compassLetters: true, minimap: true, display: null, zoom: 4, range: COMPASS_DEFAULT_RANGE, wildPals: true }

export interface MapPrefs {
	/** Marker layers shown on the map */
	layers: string[]
	/** Shade the areas where pals you still need to catch live */
	uncaught: boolean
	/** Wild pals loaded near you */
	wild: boolean
}

const defaultMap: MapPrefs = { layers: ['fast_travel'], uncaught: false, wild: true }

export const defaultSettings: PlanSettings = {
	maxGenerations: 4,
	allowCatching: true,
	allowLegendaryCatches: false,
	onlyWantedPassives: true,
	minutesPerEgg: 10,
	catchPrefs: {},
	disabledRegions: [],
	pins: {},
	surgery: defaultSurgery
}

const emptyState: AppState = {
	version: 1,
	owned: [],
	wanted: [],
	settings: defaultSettings,
	catches: {},
	map: defaultMap,
	syncCatches: true,
	overlay: defaultOverlay,
	loot: defaultLoot,
	removed: [],
	world: null,
	worlds: {},
	worldNames: {},
	craft: defaultCraft
}
const LOCAL_KEY = 'palbreeder'

const newUid = () => crypto.randomUUID()

/** Drops entries for pals the current game data doesn't know, so old saves still load */
export function sanitize(raw: unknown): AppState {
	const s = (raw ?? {}) as Partial<AppState>
	const known = (id: string) => {
		try {
			getPal(id)
			return true
		} catch {
			return false
		}
	}
	// Older saves placed the minimap by corner; it's now positioned freely
	const { corner: _corner, ...savedOverlay } = (s.overlay ?? {}) as Partial<OverlayPrefs> & { corner?: string }
	const ownedList = <T extends OwnedPal>(list: T[] | undefined): T[] => (list ?? []).filter((o) => known(o.palId)).map((o) => ({ ...o, passives: o.passives ?? [] }))
	const wantedList = (list: WantedPal[] | undefined) => (list ?? []).filter((w) => known(w.palId)).map((w) => ({ ...w, passives: w.passives ?? [] }))
	const catchList = (c: Record<string, number> | undefined) => Object.fromEntries(Object.entries(c ?? {}).filter(([id, n]) => known(id) && Number.isFinite(n) && n > 0))
	const worlds: Record<string, WorldData> = {}
	for (const [id, w] of Object.entries(s.worlds ?? {})) {
		if (!w || typeof w !== 'object') continue
		worlds[id] = {
			owned: ownedList(w.owned),
			wanted: wantedList(w.wanted),
			catches: catchList(w.catches),
			looted: sanitizeLoot({ looted: w.looted }).looted,
			removed: ownedList(w.removed).slice(0, MAX_REMOVED)
		}
	}
	return {
		version: 1,
		owned: ownedList(s.owned),
		wanted: wantedList(s.wanted),
		removed: ownedList(s.removed).slice(0, MAX_REMOVED),
		world: typeof s.world === 'string' && s.world ? s.world : null,
		worlds,
		worldNames: Object.fromEntries(Object.entries(s.worldNames ?? {}).filter(([, n]) => typeof n === 'string')),
		craft: {
			list: (s.craft?.list ?? [])
				.filter((e) => getRecipe(e.id) && Number.isFinite(e.qty) && e.qty > 0)
				.map((e) => ({ ...e, key: entryKey(e.id, e.rarity ?? null), rarity: e.rarity ?? null })),
			basic: Array.isArray(s.craft?.basic) ? s.craft.basic.filter((id) => typeof id === 'string') : DEFAULT_BASIC,
			have: Object.fromEntries(Object.entries(s.craft?.have ?? {}).filter(([, n]) => Number.isFinite(n) && n > 0))
		},
		settings: {
			...defaultSettings,
			...s.settings,
			catchPrefs: { ...s.settings?.catchPrefs },
			disabledRegions: [...(s.settings?.disabledRegions ?? [])],
			pins: { ...s.settings?.pins },
			surgery: { ...defaultSurgery, ...s.settings?.surgery, extra: [...(s.settings?.surgery?.extra ?? [])] }
		},
		catches: catchList(s.catches),
		map: { ...defaultMap, ...s.map, layers: [...(s.map?.layers ?? defaultMap.layers)] },
		syncCatches: s.syncCatches ?? true,
		overlay: {
			...defaultOverlay,
			...savedOverlay,
			range: COMPASS_RANGES.includes(savedOverlay.range as number) ? (savedOverlay.range as number) : COMPASS_DEFAULT_RANGE
		},
		loot: sanitizeLoot(s.loot)
	}
}

function sanitizeLoot(raw: Partial<LootState> | undefined): LootState {
	const loot: LootState = {
		auto: raw?.auto ?? true,
		minutes: { ...LOOT_DEFAULT_MINUTES, ...raw?.minutes },
		looted: {}
	}
	// Drop timers that have run out
	for (const [key, at] of Object.entries(raw?.looted ?? {})) {
		if (typeof at === 'number' && lootReadyAt(key, { ...loot, looted: { [key]: at } }) != null) loot.looted[key] = at
	}
	return loot
}

async function loadState(): Promise<AppState> {
	try {
		// Lists saved to browser storage by older builds move into the save file on first load
		const json = (window.palStore && (await window.palStore.load())) || localStorage.getItem(LOCAL_KEY)
		return json ? sanitize(JSON.parse(json)) : emptyState
	} catch {
		return emptyState
	}
}

async function saveState(state: AppState): Promise<void> {
	const json = JSON.stringify(state)
	if (window.palStore) await window.palStore.save(json)
	else localStorage.setItem(LOCAL_KEY, json)
}

/** `readOnly` (the overlay window) follows the main window's saves and never writes */
function useStoreValue(readOnly: boolean) {
	const [state, setState] = useState<AppState>(emptyState)
	const [loaded, setLoaded] = useState(false)
	const saveTimer = useRef<ReturnType<typeof setTimeout>>()

	useEffect(() => {
		loadState().then((s) => {
			setState(s)
			setLoaded(true)
		})
		if (readOnly && window.palStore) {
			return window.palStore.onChanged((json) => {
				try {
					setState(sanitize(JSON.parse(json)))
				} catch {
					// A malformed broadcast; keep the last good state
				}
			})
		}
	}, [readOnly])

	useEffect(() => {
		if (!loaded || readOnly) return
		clearTimeout(saveTimer.current)
		saveTimer.current = setTimeout(() => void saveState(state), 300)
		// Closing the window inside the save delay still writes the latest lists
		const flush = () => {
			clearTimeout(saveTimer.current)
			const json = JSON.stringify(state)
			if (window.palStore) window.palStore.saveNow(json)
			else localStorage.setItem(LOCAL_KEY, json)
		}
		window.addEventListener('beforeunload', flush)
		return () => window.removeEventListener('beforeunload', flush)
	}, [state, loaded, readOnly])

	const addOwned = useCallback((pal: Omit<OwnedPal, 'uid'>) => {
		setState((s) => ({ ...s, owned: [...s.owned, { ...pal, uid: newUid() }] }))
	}, [])
	const updateOwned = useCallback((pal: OwnedPal) => {
		setState((s) => ({ ...s, owned: s.owned.map((o) => (o.uid === pal.uid ? pal : o)) }))
	}, [])
	/** Adds game pals to My pals, linking ones already typed in by hand instead of doubling them */
	const addFromGame = useCallback((gamePals: GamePal[]) => {
		setState((s) => {
			const { links, adds } = planAdd(s.owned, gamePals)
			if (!links.size && !adds.length) return s
			return {
				...s,
				owned: [
					...s.owned.map((o) => (links.has(o.uid) ? { ...o, game: links.get(o.uid) } : o)),
					...adds.map((g) => ({ uid: newUid(), palId: g.palId, gender: g.gender, passives: g.passives, game: g.key, name: g.name, stats: g.stats, box: g.where?.box, seen: g.where }))
				]
			}
		})
	}, [])
	/** Keeps synced pals' stats and last known spot up to date with what the game reports */
	const syncGameStats = useCallback((gamePals: GamePal[]) => {
		setState((s) => {
			const byKey = new Map(gamePals.map((g) => [g.key, g]))
			// Pals synced before the game's ids came through are found by their content once, then by id
			const byContent = new Map(gamePals.map((g) => [g.contentKey, g]))
			let changed = false
			const owned = s.owned.map((o) => {
				const g = o.game ? (byKey.get(o.game) ?? (o.game.startsWith('id:') ? undefined : byContent.get(o.game))) : undefined
				if (!g) return o
				const next = { ...o, game: g.key, stats: g.stats ?? o.stats, box: g.where?.box ?? o.box, seen: g.where ?? o.seen, name: g.name ?? o.name }
				if (JSON.stringify([next.game, next.stats, next.box, next.seen, next.name]) === JSON.stringify([o.game, o.stats, o.box, o.seen, o.name])) return o
				changed = true
				return next
			})
			return changed ? { ...s, owned } : s
		})
	}, [])
	const trackGamePresence = useCallback((gone: string[], present: string[]) => setState((s) => withGamePresence(s, gone, present)), [])
	const restoreRemoved = useCallback((uid: string) => {
		setState((s) => {
			const r = s.removed.find((x) => x.uid === uid)
			if (!r) return s
			const { removedAt: _, ...o } = r
			return { ...s, owned: [...s.owned, o], removed: s.removed.filter((x) => x.uid !== uid) }
		})
	}, [])
	const clearRemoved = useCallback(() => setState((s) => ({ ...s, removed: [] })), [])
	const switchWorld = useCallback((id: string, name?: string) => setState((s) => withWorld(s, id, name)), [])
	const renameWorld = useCallback((id: string, name: string) => {
		setState((s) => ({ ...s, worldNames: { ...s.worldNames, [id]: name.trim().slice(0, 40) } }))
	}, [])
	/** Follows pals whose gender or passives changed at the Surgery Table, keeping them the same entry */
	const applyGameChanges = useCallback((changes: GamePalChange[]) => {
		if (!changes.length) return
		setState((s) => {
			const byFrom = new Map(changes.map((c) => [c.from, c.to]))
			let changed = false
			const owned = s.owned.map((o) => {
				const to = o.game ? byFrom.get(o.game) : undefined
				if (!to) return o
				changed = true
				return { ...o, game: to.key, gender: to.gender, passives: to.passives }
			})
			return changed ? { ...s, owned } : s
		})
	}, [])
	const removeOwned = useCallback((uid: string) => {
		setState((s) => ({ ...s, owned: s.owned.filter((o) => o.uid !== uid) }))
	}, [])
	const removeOwnedMany = useCallback((uids: string[]) => {
		const gone = new Set(uids)
		setState((s) => ({ ...s, owned: s.owned.filter((o) => !gone.has(o.uid)) }))
	}, [])

	const addWanted = useCallback((pal: Omit<WantedPal, 'uid'>) => {
		setState((s) => ({ ...s, wanted: [...s.wanted, { ...pal, uid: newUid() }] }))
	}, [])
	const addWantedMany = useCallback((palIds: string[]) => {
		setState((s) => {
			const fresh = palIds.filter((id) => !s.wanted.some((w) => w.palId === id))
			return { ...s, wanted: [...s.wanted, ...fresh.map((palId) => ({ uid: newUid(), palId, passives: [] }))] }
		})
	}, [])
	const updateWanted = useCallback((pal: WantedPal) => {
		setState((s) => ({ ...s, wanted: s.wanted.map((w) => (w.uid === pal.uid ? pal : w)) }))
	}, [])
	const removeWanted = useCallback((uid: string) => {
		setState((s) => ({ ...s, wanted: s.wanted.filter((w) => w.uid !== uid) }))
	}, [])
	const toggleWantedDisabled = useCallback((uid: string) => {
		setState((s) => ({ ...s, wanted: s.wanted.map((w) => (w.uid === uid ? { ...w, disabled: !w.disabled } : w)) }))
	}, [])
	const removeWantedPal = useCallback((palId: string) => {
		setState((s) => ({ ...s, wanted: s.wanted.filter((w) => w.palId !== palId) }))
	}, [])

	const updateSettings = useCallback((patch: Partial<PlanSettings>) => {
		setState((s) => ({ ...s, settings: { ...s.settings, ...patch } }))
	}, [])
	const setCatchPref = useCallback((palId: string, pref: CatchPref | null) => {
		setState((s) => {
			const catchPrefs = { ...s.settings.catchPrefs }
			if (pref) catchPrefs[palId] = pref
			else delete catchPrefs[palId]
			return { ...s, settings: { ...s.settings, catchPrefs } }
		})
	}, [])

	const setPin = useCallback((key: string, pin: Pin | null) => {
		setState((s) => {
			const pins = { ...s.settings.pins }
			if (pin) pins[key] = pin
			else delete pins[key]
			return { ...s, settings: { ...s.settings, pins } }
		})
	}, [])

	const setCatches = useCallback((palId: string, count: number) => {
		setState((s) => {
			const catches = { ...s.catches }
			if (count > 0) catches[palId] = count
			else delete catches[palId]
			return { ...s, catches }
		})
	}, [])

	const replaceCatches = useCallback((catches: Record<string, number>) => {
		setState((s) => ({ ...s, catches }))
	}, [])
	const setSyncCatches = useCallback((syncCatches: boolean) => {
		setState((s) => ({ ...s, syncCatches }))
	}, [])

	const updateMap = useCallback((patch: Partial<MapPrefs>) => {
		setState((s) => ({ ...s, map: { ...s.map, ...patch } }))
	}, [])

	const updateOverlay = useCallback((patch: Partial<OverlayPrefs>) => {
		setState((s) => ({ ...s, overlay: { ...s.overlay, ...patch } }))
	}, [])

	const setLooted = useCallback((key: string, at: number | null) => {
		setState((s) => {
			const looted = { ...s.loot.looted }
			if (at == null) delete looted[key]
			else looted[key] = at
			return { ...s, loot: { ...s.loot, looted } }
		})
	}, [])
	const updateLoot = useCallback((patch: Partial<LootState>) => {
		setState((s) => ({ ...s, loot: { ...s.loot, ...patch } }))
	}, [])

	const updateCraft = useCallback((patch: Partial<CraftState>) => setState((s) => ({ ...s, craft: { ...s.craft, ...patch } })), [])
	/** Adds to the checklist, merging with the same item at the same tier */
	const addToChecklist = useCallback((id: string, rarity: ChecklistEntry['rarity'], qty: number) => {
		setState((s) => {
			const key = entryKey(id, rarity)
			const has = s.craft.list.some((e) => e.key === key)
			const list = has ? s.craft.list.map((e) => (e.key === key ? { ...e, qty: e.qty + qty } : e)) : [...s.craft.list, { key, id, rarity, qty }]
			return { ...s, craft: { ...s.craft, list } }
		})
	}, [])

	const replaceState = useCallback((next: AppState) => setState(next), [])

	return useMemo(
		() => ({
			...state,
			loaded,
			state,
			addOwned,
			addFromGame,
			syncGameStats,
			updateOwned,
			removeOwned,
			removeOwnedMany,
			applyGameChanges,
			trackGamePresence,
			restoreRemoved,
			clearRemoved,
			switchWorld,
			renameWorld,
			addWanted,
			addWantedMany,
			updateWanted,
			removeWanted,
			removeWantedPal,
			toggleWantedDisabled,
			updateSettings,
			setCatchPref,
			setPin,
			setCatches,
			updateMap,
			replaceCatches,
			setSyncCatches,
			updateOverlay,
			setLooted,
			updateLoot,
			updateCraft,
			addToChecklist,
			replaceState
		}),
		[
			state,
			loaded,
			addOwned,
			addFromGame,
			syncGameStats,
			updateOwned,
			removeOwned,
			removeOwnedMany,
			applyGameChanges,
			trackGamePresence,
			restoreRemoved,
			clearRemoved,
			switchWorld,
			renameWorld,
			addWanted,
			addWantedMany,
			updateWanted,
			removeWanted,
			removeWantedPal,
			toggleWantedDisabled,
			updateSettings,
			setCatchPref,
			setPin,
			setCatches,
			updateMap,
			replaceCatches,
			setSyncCatches,
			updateOverlay,
			setLooted,
			updateLoot,
			updateCraft,
			addToChecklist,
			replaceState
		]
	)
}

type Store = ReturnType<typeof useStoreValue>
const StoreContext = createContext<Store | null>(null)

export function StoreProvider({ children, readOnly = false }: { children: ReactNode; readOnly?: boolean }) {
	const store = useStoreValue(readOnly)
	return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>
}

export function useStore(): Store {
	const store = useContext(StoreContext)
	if (!store) throw new Error('useStore outside StoreProvider')
	return store
}
