import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { normalizeCaptures } from './captures'
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
	latest(): Promise<{ live: LiveData | null; captures: CaptureData | null }>
	onLive(cb: (data: LiveData) => void): () => void
	onCaptures(cb: (data: CaptureData) => void): () => void
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
	live: LiveData | null
	connected: boolean
	captures: CaptureData | null
}

const BridgeContext = createContext<Bridge>({ available: false, motion: new Motion(), live: null, connected: false, captures: null })

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
	setTimeout(() => {
		const captures = { counts: { SheepBall: 5, PinkCat: 3, BOSS_ChickenPal: 1, ChickenPal: 2 }, mod: 'fake', at: Date.now() }
		captureListeners.forEach((cb) => cb(captures))
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
	const { syncCatches, replaceCatches, loaded } = useStore()
	const [live, setLive] = useState<LiveData | null>(null)
	const [motion] = useState(() => new Motion())
	const [captures, setCaptures] = useState<CaptureData | null>(null)
	const [now, setNow] = useState(Date.now())

	useEffect(() => {
		if (!bridgeApi) return
		bridgeApi.latest().then((d) => {
			if (d.live) setLive(d.live)
			if (d.captures) setCaptures(d.captures)
		})
		// Timestamp each update as it arrives, before React gets involved
		const offLive = bridgeApi.onLive((d) => {
			motion.push(d)
			setLive(d)
		})
		const offCaptures = bridgeApi.onCaptures(setCaptures)
		// Re-check staleness while no updates arrive
		const timer = setInterval(() => setNow(Date.now()), 1000)
		return () => {
			offLive()
			offCaptures()
			clearInterval(timer)
		}
	}, [])

	// The game's record is the source of truth for catches while syncing is on
	useEffect(() => {
		if (canSync && captures && syncCatches && loaded) replaceCatches(normalizeCaptures(captures.counts))
	}, [canSync, captures, syncCatches, loaded, replaceCatches])

	const connected = !!live && Math.max(now, Date.now()) - live.at < STALE_MS
	return <BridgeContext.Provider value={{ available: !!bridgeApi, motion, live, connected, captures }}>{children}</BridgeContext.Provider>
}

export const useBridge = () => useContext(BridgeContext)
