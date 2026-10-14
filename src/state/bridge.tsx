import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react'
import { normalizeCaptures } from './captures'
import { normalizeGamePals, type GamePal, type RawGamePal } from './gamepals'
import { Motion } from './motion'
import { useStore } from './store'

/** What the companion mod reports, relayed by the main process */
export interface LiveData {
	x: number
	y: number
	z: number
	yaw: number
	/** A menu, inventory, chest or the map is open */
	ui: boolean
	/** The mod's clock in seconds when it read the position (mod 1.2+) */
	t?: number
	mod: string
	at: number
}

export interface CaptureData {
	counts: Record<string, number>
	mod: string
	at: number
}

export interface GamePalsData {
	pals: RawGamePal[]
	mod: string
	at: number
}

export interface GameLinkStatus {
	gamePath: string | null
	ue4ss: boolean
	ue4ssSource: 'workshop' | 'manual' | null
	/** The Workshop UE4SS is downloaded but hasn't been turned on in Mod Management yet */
	workshopPending: boolean
	/** Both a Workshop and a manual UE4SS are present, which can crash the game */
	ue4ssConflict: boolean
	modVersion: string | null
	bundledVersion: string | null
	bridgeDir: string
}

interface PalBridgeApi {
	latest(): Promise<{ live: LiveData | null; captures: CaptureData | null; pals?: GamePalsData | null }>
	onLive(cb: (data: LiveData) => void): () => void
	onCaptures(cb: (data: CaptureData) => void): () => void
	/** Mod 1.4+ */
	onPals?(cb: (data: GamePalsData) => void): () => void
	status(): Promise<GameLinkStatus>
	install(): Promise<GameLinkStatus>
	chooseGameFolder(): Promise<GameLinkStatus>
	openUe4ssDownloads(): Promise<void>
	openUe4ssWorkshop(): Promise<void>
	openBridgeFolder(): Promise<void>
}

declare global {
	interface Window {
		palBridge?: PalBridgeApi
	}
}

/** Position updates older than this mean the game isn't sending any more */
const STALE_MS = 3000

interface Bridge {
	/** False in a plain browser, where there's no main process to read the mod's files */
	available: boolean
	/** Smoothed player motion for per-frame drawing */
	motion: Motion
	connected: boolean
	captures: CaptureData | null
}

/**
 * The latest position update. It changes about 20 times a second, so it stays out of React
 * context: components read it with useLive / useLiveValue, or subscribe directly, and nothing
 * else re-renders when it changes.
 */
export class LiveStore {
	live: LiveData | null = null
	private listeners = new Set<() => void>()
	set(live: LiveData) {
		this.live = live
		this.listeners.forEach((cb) => cb())
	}
	subscribe = (cb: () => void) => {
		this.listeners.add(cb)
		return () => void this.listeners.delete(cb)
	}
}

const BridgeContext = createContext<Bridge>({ available: false, motion: new Motion(), connected: false, captures: null })
const LiveContext = createContext(new LiveStore())
/** Kept apart from the bridge's position updates, which arrive many times a second */
const GamePalsContext = createContext<GamePal[]>([])

/** Dev-only stand-in for the game: walks a loop near Small Settlement (open with ?fakebridge) */
function fakeBridge(): PalBridgeApi {
	const liveListeners = new Set<(d: LiveData) => void>()
	const captureListeners = new Set<(d: CaptureData) => void>()
	let t = 0
	setInterval(() => {
		t += 0.15
		const live = { x: -346618 + Math.sin(t / 6) * 30000, y: 191707 + Math.cos(t / 6) * 30000, z: 0, yaw: ((-t / 6) * 180) / Math.PI, ui: false, mod: 'fake', at: Date.now() }
		liveListeners.forEach((cb) => cb(live))
	}, 150)
	const palListeners = new Set<(d: GamePalsData) => void>()
	setTimeout(() => {
		const captures = { counts: { SheepBall: 5, PinkCat: 3, BOSS_ChickenPal: 1, ChickenPal: 2 }, mod: 'fake', at: Date.now() }
		captureListeners.forEach((cb) => cb(captures))
		const species = ['SheepBall', 'PinkCat', 'BOSS_KingBahamut', 'Anubis', 'GuardianDog', 'Male_DarkTrader01', 'ChickenPal', 'Kitsunebi', 'IceHorse']
		const passives = ['CraftSpeed_up3', 'PAL_CorporateSlave', 'Nocturnal', 'MoveSpeed_up_2', 'Rare', 'ElementBoost_Fire_2_PAL']
		const fake = Array.from({ length: 300 }, (_, i) => ({
			c: species[i % species.length],
			g: (i % 3) % 2 ? 2 : 1,
			p: passives.filter((_, j) => (i + j) % 4 === 0),
			iv: [i % 101, (i * 7) % 101, (i * 13) % 101],
			in: i < 5 ? 'party' : 'box',
			s: i < 5 ? i : i - 5,
			lv: 30 + (i % 31),
			r: 1 + (i % 5),
			sr: [i % 11, (i * 3) % 11, (i * 7) % 11]
		}))
		palListeners.forEach((cb) => cb({ pals: fake, mod: 'fake', at: Date.now() }))
	}, 1500)
	const status: GameLinkStatus = {
		gamePath: 'C:\\Fake\\Palworld',
		ue4ss: true,
		ue4ssSource: 'workshop',
		workshopPending: false,
		ue4ssConflict: false,
		modVersion: '1.0.0',
		bundledVersion: '1.0.0',
		bridgeDir: 'C:\\Fake\\bridge'
	}
	return {
		latest: async () => ({ live: null, captures: null }),
		onLive: (cb) => (liveListeners.add(cb), () => void liveListeners.delete(cb)),
		onCaptures: (cb) => (captureListeners.add(cb), () => void captureListeners.delete(cb)),
		onPals: (cb) => (palListeners.add(cb), () => void palListeners.delete(cb)),
		status: async () => status,
		install: async () => status,
		chooseGameFolder: async () => status,
		openUe4ssDownloads: async () => {},
		openUe4ssWorkshop: async () => {},
		openBridgeFolder: async () => {}
	}
}

// The simulator also stands in for the overlay controls, so the Overlay tab can be tried in a browser
if (import.meta.env.DEV && location.search.includes('fakebridge') && !window.palOverlay) {
	const off = () => () => {}
	window.palOverlay = {
		set: async () => {},
		edit: async () => {},
		sendLayout: async () => {},
		displays: async () => [{ id: 1, label: 'Fake', primary: true, width: 5120, height: 1440 }],
		hotkey: async () => 'Ctrl+Shift+O',
		onToggled: off,
		onEditing: off,
		onLayout: off
	}
}

export const bridgeApi: PalBridgeApi | undefined =
	window.palBridge ?? (import.meta.env.DEV && location.search.includes('fakebridge') ? fakeBridge() : undefined)

/** `syncCatches` is off in the overlay window, which only reads */
export function BridgeProvider({ children, syncCatches: canSync = true }: { children: ReactNode; syncCatches?: boolean }) {
	const { syncCatches, replaceCatches, syncGameStats, loaded } = useStore()
	const [liveStore] = useState(() => new LiveStore())
	const [connected, setConnected] = useState(false)
	const [motion] = useState(() => new Motion())
	const [captures, setCaptures] = useState<CaptureData | null>(null)
	const [gamePals, setGamePals] = useState<GamePal[]>([])

	// Your pals seen this session. The Palbox only loads the pages you open, so pals stay listed
	// after their page unloads.
	useEffect(() => {
		if (!bridgeApi?.onPals || !canSync) return
		const merge = (d: GamePalsData) =>
			setGamePals((prev) => {
				const fresh = new Map(normalizeGamePals(d.pals).map((p) => [p.key, p]))
				let changed = false
				const kept = prev.map((p) => {
					const now = fresh.get(p.key)
					fresh.delete(p.key)
					if (!now || (now.where?.box === p.where?.box && now.where?.slot === p.where?.slot && JSON.stringify(now.stats) === JSON.stringify(p.stats))) return p
					changed = true
					return now
				})
				return changed || fresh.size ? [...kept, ...fresh.values()] : prev
			})
		bridgeApi.latest().then((d) => d.pals && merge(d.pals))
		return bridgeApi.onPals(merge)
	}, [canSync])

	useEffect(() => {
		if (!bridgeApi) return
		const isFresh = () => !!liveStore.live && Date.now() - liveStore.live.at < STALE_MS
		bridgeApi.latest().then((d) => {
			if (d.live) liveStore.set(d.live)
			if (d.captures) setCaptures(d.captures)
			setConnected(isFresh())
		})
		// Timestamp each update as it arrives, before React gets involved
		const offLive = bridgeApi.onLive((d) => {
			motion.push(d)
			liveStore.set(d)
			setConnected(true)
		})
		const offCaptures = bridgeApi.onCaptures(setCaptures)
		// Re-check staleness while no updates arrive
		const timer = setInterval(() => setConnected(isFresh()), 1000)
		return () => {
			offLive()
			offCaptures()
			clearInterval(timer)
		}
	}, [])

	// Synced pals in My Pals keep their latest stats, for expedition estimates
	useEffect(() => {
		if (canSync && loaded && gamePals.length) syncGameStats(gamePals)
	}, [canSync, loaded, gamePals, syncGameStats])

	// The game's record is the source of truth for catches while syncing is on
	useEffect(() => {
		if (canSync && captures && syncCatches && loaded) replaceCatches(normalizeCaptures(captures.counts))
	}, [canSync, captures, syncCatches, loaded, replaceCatches])

	const bridge = useMemo(() => ({ available: !!bridgeApi, motion, connected, captures }), [motion, connected, captures])
	return (
		<BridgeContext.Provider value={bridge}>
			<LiveContext.Provider value={liveStore}>
				<GamePalsContext.Provider value={gamePals}>{children}</GamePalsContext.Provider>
			</LiveContext.Provider>
		</BridgeContext.Provider>
	)
}

export const useBridge = () => useContext(BridgeContext)
export const useLiveStore = () => useContext(LiveContext)

/** The latest position update; re-renders on every one, so keep its users small */
export function useLive(): LiveData | null {
	const store = useContext(LiveContext)
	return useSyncExternalStore(store.subscribe, () => store.live)
}

/** Something derived from the latest position; re-renders only when it changes (return a primitive) */
export function useLiveValue<T extends string | number | boolean | null>(select: (live: LiveData | null) => T): T {
	const store = useContext(LiveContext)
	return useSyncExternalStore(store.subscribe, () => select(store.live))
}
export const useGamePals = () => useContext(GamePalsContext)
