import { createContext, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { normalizeCaptures } from './captures'
import { diffGamePals, goneKeys, normalizeGamePals, type GamePal, type RawGamePal } from './gamepals'
import { Motion } from './motion'
import { useActions, useLoaded, useStoreSelect } from './store'
import { normalizeWildPals, type RawWildPal, type WildPal } from './wildpals'
import { collectedMarkerKeys } from '../data/collectibles'
import { layerById, layerPoints, pixelToWorld } from '../data/map'

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
	/** Mod 1.8+: the world these catches belong to */
	world?: string
}

export interface GamePalsData {
	pals: RawGamePal[]
	mod: string
	at: number
	/** Mod 1.8+: which game session, world and save these came from, and what the mod could read */
	session?: string
	world?: { id: string; name: string }
	ok?: { id: boolean; old: boolean }
}

/** Mod 1.10+: the effigies and journals you've collected, by class and world position */
export interface CollectedData {
	items: { c: string; x: number; y: number }[]
	world?: string
	mod: string
	at: number
}

/** Mod 1.9+: wild pals the game has loaded near you */
export interface WildPalsData {
	pals: RawWildPal[]
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
	latest(): Promise<{ live: LiveData | null; captures: CaptureData | null; pals?: GamePalsData | null; wild?: WildPalsData | null; collected?: CollectedData | null }>
	onLive(cb: (data: LiveData) => void): () => void
	onCaptures(cb: (data: CaptureData) => void): () => void
	/** Mod 1.4+ */
	onPals?(cb: (data: GamePalsData) => void): () => void
	/** Mod 1.9+ */
	onWild?(cb: (data: WildPalsData) => void): () => void
	/** Mod 1.10+ */
	onCollected?(cb: (data: CollectedData) => void): () => void
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
/** Changes every couple of seconds while you move, so it has its own context too */
const WildPalsContext = createContext<WildPal[]>([])

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
	const wildListeners = new Set<(d: WildPalsData) => void>()
	// A herd and some loners around wherever the walk is, drifting a little each update
	const herd = ['SheepBall', 'SheepBall', 'SheepBall', 'PinkCat', 'BOSS_ChickenPal', 'Kitsunebi', 'ChickenPal', 'ChickenPal', 'IceHorse', 'SheepBall']
	setInterval(() => {
		const cx = -346618 + Math.sin(t / 6) * 30000
		const cy = 191707 + Math.cos(t / 6) * 30000
		const pals = herd.map((c, i) => ({
			c,
			x: cx + Math.cos(i * 1.7) * (4000 + (i % 3) * 600) + Math.sin(t + i) * 300,
			y: cy + Math.sin(i * 1.7) * (4000 + (i % 3) * 600),
			z: 0,
			lv: 3 + i,
			g: 1 + (i % 2),
			...(i === 5 ? { l: true } : {})
		}))
		// The first three sheep share a spot, so they draw as one portrait
		for (const p of pals.slice(1, 3)) Object.assign(p, { x: pals[0].x + 400, y: pals[0].y - 300 })
		wildListeners.forEach((cb) => cb({ pals, mod: 'fake', at: Date.now() }))
	}, 2000)
	setTimeout(() => {
		const captures = { counts: { SheepBall: 5, PinkCat: 3, BOSS_ChickenPal: 1, ChickenPal: 2 }, mod: 'fake', at: Date.now() }
		captureListeners.forEach((cb) => cb(captures))
		const species = ['SheepBall', 'PinkCat', 'BOSS_KingBahamut', 'Anubis', 'GuardianDog', 'Male_DarkTrader01', 'ChickenPal', 'Kitsunebi', 'IceHorse']
		const passives = ['CraftSpeed_up3', 'PAL_CorporateSlave', 'Nocturnal', 'MoveSpeed_up_2', 'Rare', 'ElementBoost_Fire_2_PAL']
		const fake = Array.from({ length: 300 }, (_, i) => ({
			id: (i + 1).toString(16).padStart(32, '0'),
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
		const read = (pals: typeof fake) => ({ pals, mod: 'fake', at: Date.now(), session: 'fake', world: { id: 'fake-world|me', name: 'Fake Server' }, ok: { id: true, old: true } })
		palListeners.forEach((cb) => cb(read(fake)))
		// Ten seconds later two pals have been sold, to try Recently Removed
		setTimeout(() => palListeners.forEach((cb) => cb(read(fake.filter((_, i) => i !== 10 && i !== 11)))), 10_000)
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
		onWild: (cb) => (wildListeners.add(cb), () => void wildListeners.delete(cb)),
		onCollected: (cb) => {
			// The first few Lifmunk Effigies and journals, as if collected
			const items = (['lifmunk_effigy', 'journals'] as const).flatMap((id) =>
				layerPoints(layerById.get(id)!, 0)
					.slice(0, id === 'journals' ? 4 : 12)
					.map((p) => ({ c: id === 'journals' ? 'Note' : 'Relic', ...pixelToWorld(0, p.px, p.py) }))
			)
			const timer = setTimeout(() => cb({ items, world: 'fake-world|me', mod: 'fake', at: Date.now() }), 2500)
			return () => clearTimeout(timer)
		},
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
	const syncCatches = useStoreSelect((s) => s.syncCatches)
	const syncCollected = useStoreSelect((s) => s.map.syncCollected)
	const world = useStoreSelect((s) => s.world)
	const loaded = useLoaded()
	const { replaceCatches, syncGameStats, applyGameChanges, trackGamePresence, switchWorld, addCollected } = useActions()
	const [collected, setCollected] = useState<CollectedData | null>(null)
	// The previous read, and the game session and world it came from
	const lastRead = useRef<{ pals: GamePal[]; session?: string; world?: string }>({ pals: [] })
	const [liveStore] = useState(() => new LiveStore())
	const [connected, setConnected] = useState(false)
	const [motion] = useState(() => new Motion())
	const [captures, setCaptures] = useState<CaptureData | null>(null)
	const [gamePals, setGamePals] = useState<GamePal[]>([])
	const [wildPals, setWildPals] = useState<WildPal[]>([])

	useEffect(() => {
		if (!bridgeApi?.onWild) return
		const take = (d: WildPalsData) => setWildPals(normalizeWildPals(d.pals))
		bridgeApi.latest().then((d) => d.wild && take(d.wild))
		return bridgeApi.onWild(take)
	}, [])

	// Your party and the Palbox pages you've opened, as the game has them now. Opened pages stay
	// loaded for the session, so a pal that drops out was sold, condensed, released or moved out.
	useEffect(() => {
		if (!bridgeApi?.onPals || !canSync || !loaded) return
		const merge = (d: GamePalsData) => {
			// Each save or server keeps its own lists
			if (d.world) switchWorld(d.world.id, d.world.name)
			const next = normalizeGamePals(d.pals)
			const last = lastRead.current
			// Only reads from the same game session compare: a new session starts with most pages unloaded
			const sameSession = !!d.session && d.session === last.session && d.world?.id === last.world
			const prev = sameSession ? last.pals : []
			// A pal whose gender, passives or IVs changed is still the same pal
			const changes = diffGamePals(prev, next)
			applyGameChanges(changes)
			// Gone for good only when the Palbox is loaded and the mod would have seen a move to a base or storage
			const trusted = d.ok?.old === true && next.some((p) => p.where?.box === 'palbox')
			trackGamePresence(
				trusted ? goneKeys(prev, next, changes) : [],
				next.map((p) => p.key)
			)
			lastRead.current = { pals: next, session: d.session, world: d.world?.id }
			setGamePals((old) => (JSON.stringify(next) === JSON.stringify(old) ? old : next))
		}
		bridgeApi.latest().then((d) => d.pals && merge(d.pals))
		return bridgeApi.onPals(merge)
	}, [canSync, loaded, applyGameChanges, trackGamePresence, switchWorld])

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

	// The game's record is the source of truth for catches while syncing is on, filed under its world
	useEffect(() => {
		if (!canSync || !captures || !loaded) return
		if (captures.world && captures.world !== world) {
			switchWorld(captures.world)
			return
		}
		if (syncCatches) replaceCatches(normalizeCaptures(captures.counts))
	}, [canSync, captures, syncCatches, loaded, world, replaceCatches, switchWorld])

	useEffect(() => {
		if (!bridgeApi?.onCollected || !canSync) return
		bridgeApi.latest().then((d) => d.collected && setCollected(d.collected))
		return bridgeApi.onCollected(setCollected)
	}, [canSync])

	// Collected effigies and journals mark their map markers, filed under the game's world
	useEffect(() => {
		if (!canSync || !collected || !loaded || !syncCollected) return
		if (collected.world && collected.world !== world) {
			switchWorld(collected.world)
			return
		}
		addCollected(collectedMarkerKeys(collected.items))
	}, [canSync, collected, loaded, syncCollected, world, switchWorld, addCollected])

	const bridge = useMemo(() => ({ available: !!bridgeApi, motion, connected, captures }), [motion, connected, captures])
	return (
		<BridgeContext.Provider value={bridge}>
			<LiveContext.Provider value={liveStore}>
				<GamePalsContext.Provider value={gamePals}>
					<WildPalsContext.Provider value={connected ? wildPals : NO_WILD}>{children}</WildPalsContext.Provider>
				</GamePalsContext.Provider>
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
/** Wild pals loaded near you; empty while the game isn't connected */
export const useWildPals = () => useContext(WildPalsContext)
const NO_WILD: WildPal[] = []
