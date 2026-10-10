import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { getPal } from '../data/gamedata'
import type { CatchPref, OwnedPal, PlanSettings, WantedPal } from '../solver/types'

declare global {
	interface Window {
		palStore?: { load(): Promise<string | null>; save(json: string): Promise<void>; saveNow(json: string): void }
	}
}

export interface AppState {
	version: 1
	owned: OwnedPal[]
	wanted: WantedPal[]
	settings: PlanSettings
}

export const defaultSettings: PlanSettings = {
	maxGenerations: 4,
	allowCatching: true,
	allowLegendaryCatches: false,
	onlyWantedPassives: true,
	minutesPerEgg: 10,
	catchPrefs: {}
}

const emptyState: AppState = { version: 1, owned: [], wanted: [], settings: defaultSettings }
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
		settings: { ...defaultSettings, ...s.settings, catchPrefs: { ...s.settings?.catchPrefs } }
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

function useStoreValue() {
	const [state, setState] = useState<AppState>(emptyState)
	const [loaded, setLoaded] = useState(false)
	const saveTimer = useRef<ReturnType<typeof setTimeout>>()

	useEffect(() => {
		loadState().then((s) => {
			setState(s)
			setLoaded(true)
		})
	}, [])

	useEffect(() => {
		if (!loaded) return
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
	}, [state, loaded])

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
			updateSettings,
			setCatchPref,
			replaceState
		}),
		[state, loaded, addOwned, updateOwned, removeOwned, addWanted, addWantedMany, updateWanted, removeWanted, removeWantedPal, updateSettings, setCatchPref, replaceState]
	)
}

type Store = ReturnType<typeof useStoreValue>
const StoreContext = createContext<Store | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
	const store = useStoreValue()
	return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>
}

export function useStore(): Store {
	const store = useContext(StoreContext)
	if (!store) throw new Error('useStore outside StoreProvider')
	return store
}
