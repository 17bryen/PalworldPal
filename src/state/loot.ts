import { useEffect, useRef, useState } from 'react'
import { allLootSpots, worldToPixel } from '../data/map'
import { useBridge, useLiveStore } from './bridge'
import { lootReadyAt, useActions, useLoaded, useStoreSelect } from './store'

/** Within this many world units (centimeters) of a spot counts as standing on it */
const STAND_RADIUS = 400
/** How long you have to stay there before it's marked looted */
const STAND_MS = 2500

/** Marks a lootable spot looted once you've stood on it for a moment (main window only) */
export function useLootTracker() {
	const loaded = useLoaded()
	const loot = useStoreSelect((s) => s.loot)
	const { setLooted } = useActions()
	const { connected } = useBridge()
	const liveStore = useLiveStore()
	const standing = useRef<{ key: string; since: number } | null>(null)
	const lootRef = useRef(loot)
	lootRef.current = loot

	// Checks each position update directly, without re-rendering anything
	useEffect(() => {
		standing.current = null
		if (!loaded || !loot.auto || !connected) return
		return liveStore.subscribe(() => {
			const live = liveStore.live
			if (!live) return
			const map = worldToPixel(live.x, live.y).map
			let nearest: string | null = null
			let best = STAND_RADIUS
			for (const spot of allLootSpots()) {
				if (spot.map !== map) continue
				const d = Math.hypot(spot.x - live.x, spot.y - live.y)
				if (d <= best) {
					best = d
					nearest = spot.key
				}
			}
			const now = Date.now()
			if (!nearest) {
				standing.current = null
				return
			}
			if (standing.current?.key !== nearest) {
				standing.current = { key: nearest, since: now }
				return
			}
			if (now - standing.current.since >= STAND_MS && lootReadyAt(nearest, lootRef.current) == null) {
				setLooted(nearest, now)
			}
		})
	}, [liveStore, connected, loaded, loot.auto, setLooted])
}

/** Re-renders once a minute, so timers that run out bring their spots back */
export function useMinuteTick(): number {
	const [tick, setTick] = useState(() => Math.floor(Date.now() / 60000))
	useEffect(() => {
		const timer = setInterval(() => setTick(Math.floor(Date.now() / 60000)), 15000)
		return () => clearInterval(timer)
	}, [])
	return tick
}

/** "back in ~2h 14m (about 9:45 PM)" */
export function describeReady(readyAt: number, now = Date.now()): string {
	const mins = Math.max(1, Math.round((readyAt - now) / 60000))
	const span = mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`
	const clock = new Date(readyAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
	return `back in ~${span} (about ${clock})`
}
