import { useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, TileLayer } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Box } from '@mui/material'
import { layerPoints, mapLayers, pixelToWorld, worldToPixel, type MapIndex } from '../data/map'
import { useBridge, type LiveData } from '../state/bridge'
import { useStore, type OverlayPrefs } from '../state/store'
import { asset, BOUNDS, LayerMarkers, PlayerMarker, toLatLng } from './MapPage'

const COMPASS_WIDTH = 720
/** The strip shows this many degrees either side of where you're looking */
const COMPASS_HALF_FOV = 90
const COMPASS_MAX_MARKERS = 16
/** Only the nearest few get a distance label, so labels don't pile up */
const COMPASS_LABELS = 5
const CARDINALS: Record<number, string> = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' }

const wrap180 = (deg: number) => ((((deg + 180) % 360) + 360) % 360) - 180

/** Eases the 10-per-second game updates into per-frame motion for the compass */
function useSmoothLive(live: LiveData | null): LiveData | null {
	const [shown, setShown] = useState(live)
	const glide = useRef({ from: live, to: live, start: 0, duration: 100, lastAt: 0 })
	useEffect(() => {
		if (!live) return
		const now = performance.now()
		const g = glide.current
		const t = g.from && g.to ? Math.min(1, (now - g.start) / g.duration) : 1
		const current = g.from && g.to ? blend(g.from, g.to, t) : live
		g.from = current
		g.to = { ...live, yaw: current.yaw + wrap180(live.yaw - current.yaw) }
		g.start = now
		g.duration = Math.min(300, Math.max(60, now - g.lastAt))
		g.lastAt = now
	}, [live])
	useEffect(() => {
		let frame = 0
		const tick = () => {
			const g = glide.current
			if (g.from && g.to) setShown(blend(g.from, g.to, Math.min(1, (performance.now() - g.start) / g.duration)))
			frame = requestAnimationFrame(tick)
		}
		frame = requestAnimationFrame(tick)
		return () => cancelAnimationFrame(frame)
	}, [])
	return live ? shown : null
}

function blend(a: LiveData, b: LiveData, t: number): LiveData {
	return { ...b, x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, yaw: a.yaw + (b.yaw - a.yaw) * t }
}

/** Every point of the shown marker layers in world units, for distance and direction */
function useWorldPoints(layerIds: string[], map: MapIndex) {
	return useMemo(() => {
		const points: { x: number; y: number; icon: string | null; name: string }[] = []
		for (const layer of mapLayers) {
			if (!layerIds.includes(layer.id)) continue
			for (const p of layerPoints(layer, map)) {
				const w = pixelToWorld(map, p.px, p.py)
				points.push({ ...w, icon: layer.icon, name: p.label ?? layer.name })
			}
		}
		return points
	}, [layerIds, map])
}

function Compass({ live, layerIds, range }: { live: LiveData; layerIds: string[]; range: number }) {
	const map = worldToPixel(live.x, live.y).map
	const points = useWorldPoints(layerIds, map)
	const toX = (relDeg: number) => COMPASS_WIDTH / 2 + (relDeg / COMPASS_HALF_FOV) * (COMPASS_WIDTH / 2)

	// Nearest markers in front of you within range; world units are centimeters
	const nearby = points
		.map((p) => {
			const dx = p.x - live.x // north
			const dy = p.y - live.y // east
			const meters = Math.hypot(dx, dy) / 100
			const rel = wrap180((Math.atan2(dy, dx) * 180) / Math.PI - live.yaw)
			return { ...p, meters, rel }
		})
		.filter((p) => p.meters <= range && Math.abs(p.rel) <= COMPASS_HALF_FOV)
		.sort((a, b) => a.meters - b.meters)
		.slice(0, COMPASS_MAX_MARKERS)

	// Label the nearest few, skipping any that would sit on top of a label already placed
	const labelled: number[] = []
	const showLabel = nearby.map((p) => {
		const x = toX(p.rel)
		if (labelled.length >= COMPASS_LABELS || labelled.some((lx) => Math.abs(lx - x) < 48)) return false
		labelled.push(x)
		return true
	})

	const ticks: { rel: number; heading: number }[] = []
	for (let heading = 0; heading < 360; heading += 15) {
		const rel = wrap180(heading - live.yaw)
		if (Math.abs(rel) <= COMPASS_HALF_FOV) ticks.push({ rel, heading })
	}

	return (
		<Box
			sx={{
				position: 'absolute',
				top: 18,
				left: '50%',
				transform: 'translateX(-50%)',
				width: COMPASS_WIDTH,
				height: 64,
				// Fades out at both ends instead of stopping at a hard edge
				maskImage: 'linear-gradient(to right, transparent, black 12%, black 88%, transparent)'
			}}
		>
			<Box sx={{ position: 'absolute', inset: '0 0 22px 0', background: 'rgba(14,16,20,0.55)', borderRadius: 1 }} />
			{ticks.map(({ rel, heading }) => {
				const label = CARDINALS[heading]
				return (
					<Box key={heading} sx={{ position: 'absolute', left: toX(rel), top: 0, transform: 'translateX(-50%)', textAlign: 'center' }}>
						<Box sx={{ width: '2px', height: label ? 10 : 6, mx: 'auto', bgcolor: label ? '#e8ecf2' : 'rgba(232,236,242,0.5)' }} />
						{label && (
							<Box sx={{ fontSize: label.length === 1 ? 15 : 12, fontWeight: 800, color: label === 'N' ? '#f07a7a' : '#e8ecf2', textShadow: '0 1px 3px #000' }}>
								{label}
							</Box>
						)}
					</Box>
				)
			})}
			{nearby.map((p, i) => (
				<Box
					key={i}
					title={p.name}
					sx={{
						position: 'absolute',
						left: toX(p.rel),
						top: 14,
						transform: 'translateX(-50%)',
						textAlign: 'center',
						opacity: 1 - (p.meters / range) * 0.6,
						zIndex: COMPASS_MAX_MARKERS - i
					}}
				>
					{p.icon && <img src={asset(`map/icons/${p.icon}`)} width={26} height={26} style={{ filter: 'drop-shadow(0 1px 2px #000)' }} />}
					{showLabel[i] && (
						<Box sx={{ fontSize: 11, fontWeight: 700, color: '#e8ecf2', textShadow: '0 1px 3px #000', whiteSpace: 'nowrap' }}>{Math.round(p.meters)} m</Box>
					)}
				</Box>
			))}
			{/* Where you're looking */}
			<Box sx={{ position: 'absolute', left: '50%', top: 0, width: '2px', height: 42, bgcolor: '#5cc8f0', transform: 'translateX(-50%)', boxShadow: '0 0 6px #5cc8f0' }} />
		</Box>
	)
}

function Minimap({ live, layerIds, prefs }: { live: LiveData; layerIds: string[]; prefs: OverlayPrefs }) {
	const here = worldToPixel(live.x, live.y)
	const shown = useMemo(() => mapLayers.filter((l) => layerIds.includes(l.id)), [layerIds])
	const margin = 24
	const place = {
		top: prefs.corner.startsWith('top') ? margin + (prefs.compass ? 76 : 0) : undefined,
		bottom: prefs.corner.startsWith('bottom') ? margin : undefined,
		left: prefs.corner.endsWith('left') ? margin : undefined,
		right: prefs.corner.endsWith('right') ? margin : undefined
	}
	return (
		<Box
			sx={{
				position: 'absolute',
				...place,
				width: prefs.size,
				height: prefs.size,
				borderRadius: '50%',
				overflow: 'hidden',
				border: '3px solid rgba(232,236,242,0.85)',
				boxShadow: '0 4px 18px rgba(0,0,0,0.6)',
				bgcolor: '#0e1014',
				'& .leaflet-container': { background: '#0e1014' }
			}}
		>
			<MapContainer
				key={`${here.map}-${prefs.zoom}`}
				crs={L.CRS.Simple}
				center={toLatLng(here.px, here.py)}
				zoom={prefs.zoom}
				minZoom={0}
				maxZoom={6}
				zoomControl={false}
				attributionControl={false}
				dragging={false}
				scrollWheelZoom={false}
				doubleClickZoom={false}
				touchZoom={false}
				boxZoom={false}
				keyboard={false}
				// It re-centers every frame, which would keep restarting tile fade-ins forever
				fadeAnimation={false}
				zoomAnimation={false}
				markerZoomAnimation={false}
				preferCanvas
				style={{ width: '100%', height: '100%' }}
			>
				<TileLayer url={asset(`map/${here.map === 0 ? 'main' : 'worldTree'}/z{z}x{x}y{y}.webp`)} tileSize={512} maxNativeZoom={4} noWrap bounds={BOUNDS} />
				{shown.map((l) => (
					<LayerMarkers key={l.id} layer={l} map={here.map} />
				))}
				<PlayerMarker map={here.map} follow />
			</MapContainer>
			<Box
				sx={{
					position: 'absolute',
					top: 4,
					left: '50%',
					transform: 'translateX(-50%)',
					zIndex: 1000,
					fontSize: 13,
					fontWeight: 800,
					color: '#f07a7a',
					textShadow: '0 1px 3px #000'
				}}
			>
				N
			</Box>
		</Box>
	)
}

/** The whole overlay window: transparent everywhere except the compass and minimap */
export function OverlayApp() {
	const { overlay, map, loaded } = useStore()
	const { live, connected } = useBridge()
	const smooth = useSmoothLive(connected ? live : null)
	if (!loaded || !overlay.enabled || !smooth) return null
	return (
		<Box sx={{ position: 'fixed', inset: 0, pointerEvents: 'none', fontFamily: 'Roboto, system-ui, sans-serif' }}>
			{overlay.compass && <Compass live={smooth} layerIds={map.layers} range={overlay.range} />}
			{overlay.minimap && <Minimap live={live!} layerIds={map.layers} prefs={overlay} />}
		</Box>
	)
}
