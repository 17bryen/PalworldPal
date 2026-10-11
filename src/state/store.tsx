import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { getPal } from '../data/gamedata'
import type { CatchPref, OwnedPal, Pin, PlanSettings, WantedPal } from '../solver/types'

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
}

export type OverlayCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

export interface OverlayPrefs {
	/** Shown over the game (also toggled by the hotkey) */
	enabled: boolean
	compass: boolean
	minimap: boolean
	corner: OverlayCorner
	/** Minimap diameter in pixels */
	size: number
	/** Minimap zoom, same scale as the Map tab */
	zoom: number
	/** Compass shows markers within this many meters, up to COMPASS_MAX_RANGE */
	range: number
}

/** Beyond this the compass gets too crowded to read */
export const COMPASS_MAX_RANGE = 200

const defaultOverlay: OverlayPrefs = { enabled: false, compass: true, minimap: true, corner: 'top-right', size: 240, zoom: 4, range: COMPASS_MAX_RANGE }

export interface MapPrefs {
	/** Marker layers shown on the map */
	layers: string[]
	/** Shade the areas where pals you still need to catch live */
	uncaught: boolean
}

const defaultMap: MapPrefs = { layers: ['fast_travel'], uncaught: false }

export const defaultSettings: PlanSettings = {
	maxGenerations: 4,
	allowCatching: true,
	allowLegendaryCatches: false,
	onlyWantedPassives: true,
	minutesPerEgg: 10,
	catchPrefs: {},
	disabledRegions: [],
	pins: {}
}

const emptyState: AppState = { version: 1, owned: [], wanted: [], settings: defaultSettings, catches: {}, map: defaultMap, syncCatches: true, overlay: defaultOverlay }
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
	return {
		version: 1,
		owned: (s.owned ?? []).filter((o) => known(o.palId)).map((o) => ({ ...o, passives: o.passives ?? [] })),
		wanted: (s.wanted ?? []).filter((w) => known(w.palId)).map((w) => ({ ...w, passives: w.passives ?? [] })),
		settings: {
			...defaultSettings,
			...s.settings,
			catchPrefs: { ...s.settings?.catchPrefs },
			disabledRegions: [...(s.settings?.disabledRegions ?? [])],
			pins: { ...s.settings?.pins }
		},
		catches: Object.fromEntries(Object.entries(s.catches ?? {}).filter(([id, n]) => known(id) && Number.isFinite(n) && n > 0)),
		map: { ...defaultMap, ...s.map, layers: [...(s.map?.layers ?? defaultMap.layers)] },
		syncCatches: s.syncCatches ?? true,
		overlay: { ...defaultOverlay, ...s.overlay, range: Math.min(COMPASS_MAX_RANGE, s.overlay?.range ?? COMPASS_MAX_RANGE) }
	}
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
	const removeOwned = useCallback((uid: string) => {
		setState((s) => ({ ...s, owned: s.owned.filter((o) => o.uid !== uid) }))
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

	const replaceState = useCallback((next: AppState) => setState(next), [])

	return useMemo(
		() => ({
			...state,
			loaded,
			state,
			addOwned,
			updateOwned,
			removeOwned,
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
			replaceState
		}),
		[
			state,
			loaded,
			addOwned,
			updateOwned,
			removeOwned,
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
