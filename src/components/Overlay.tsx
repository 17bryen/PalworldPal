import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { MapContainer, TileLayer } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Box, Button, Paper, Typography } from '@mui/material'
import { layerPoints, mapLayers, pixelToWorld, worldToPixel, type MapIndex } from '../data/map'
import { useBridge, type LiveData } from '../state/bridge'
import type { Motion, Pose } from '../state/motion'
import { defaultLayout, lootReadyAt, useStore, type OverlayLayout, type OverlayPrefs } from '../state/store'
import { useMinuteTick } from '../state/loot'
import { asset, BOUNDS, LayerMarkers, PlayerMarker, toLatLng } from './MapPage'

const COMPASS_HEIGHT = 84
/** The dark strip with the headings; markers hang below its top edge */
const COMPASS_BAR = 42
const COMPASS_ICON = 39
/** The strip shows this many degrees either side of where you're looking */
const COMPASS_HALF_FOV = 90
const COMPASS_MAX_MARKERS = 16
/** Only the nearest few get a distance label, so labels don't pile up */
const COMPASS_LABELS = 5
const CARDINALS: Record<number, string> = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' }
const MINIMAP_MARGIN = 24
const COMPASS_WIDTH_RANGE: [number, number] = [300, 1800]
const MINIMAP_SIZE_RANGE: [number, number] = [120, 520]

/** Shown while editing the layout without the game connected */
const PREVIEW_LIVE: LiveData = { x: -346618, y: 191707, z: 0, yaw: 0, ui: false, mod: 'preview', at: 0 }

const wrap180 = (deg: number) => ((((deg + 180) % 360) + 360) % 360) - 180
const clamp = (v: number, [lo, hi]: [number, number]) => Math.min(hi, Math.max(lo, v))

/** The smoothed player pose, re-read every frame */
function useFramePose(motion: Motion, active: boolean): Pose | null {
	const [pose, setPose] = useState<Pose | null>(null)
	useEffect(() => {
		if (!active) {
			setPose(null)
			return
		}
		let frame = 0
		const tick = () => {
			setPose(motion.at())
			frame = requestAnimationFrame(tick)
		}
		frame = requestAnimationFrame(tick)
		return () => cancelAnimationFrame(frame)
	}, [motion, active])
	return pose
}

/** Every point of the shown marker layers in world units, for distance and direction */
function useWorldPoints(layerIds: string[], map: MapIndex) {
	return useMemo(() => {
		const points: { key: string; x: number; y: number; icon: string | null; name: string }[] = []
		for (const layer of mapLayers) {
			if (!layerIds.includes(layer.id)) continue
			for (const p of layerPoints(layer, map)) {
				const w = pixelToWorld(map, p.px, p.py)
				points.push({ ...w, key: p.key, icon: layer.icon, name: p.label ?? layer.name })
			}
		}
		return points
	}, [layerIds, map])
}

function Compass({ pose, layerIds, range, width, prefs }: { pose: Pose; layerIds: string[]; range: number; width: number; prefs: OverlayPrefs }) {
	const map = worldToPixel(pose.x, pose.y).map
	const all = useWorldPoints(layerIds, map)
	const { loot } = useStore()
	const minute = useMinuteTick()
	// Looted spots stay off the compass until they're back
	const points = useMemo(() => all.filter((p) => lootReadyAt(p.key, loot) == null), [all, loot, minute])
	const toX = (relDeg: number) => width / 2 + (relDeg / COMPASS_HALF_FOV) * (width / 2)

	// The nearest markers in any direction, refreshed only when you've moved a few meters, so each
	// frame just re-angles a short list; world units are centimeters
	const cellX = Math.round(pose.x / 300)
	const cellY = Math.round(pose.y / 300)
	const candidates = useMemo(
		() =>
			points
				.map((p) => ({ ...p, d: Math.hypot(p.x - pose.x, p.y - pose.y) }))
				.filter((p) => !range || p.d / 100 <= range + 10)
				.sort((a, b) => a.d - b.d)
				.slice(0, COMPASS_MAX_MARKERS * 4),
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[points, range, cellX, cellY]
	)
	const nearby = candidates
		.map((p) => {
			const dx = p.x - pose.x // north
			const dy = p.y - pose.y // east
			const meters = Math.hypot(dx, dy) / 100
			const rel = wrap180((Math.atan2(dy, dx) * 180) / Math.PI - pose.yaw)
			return { ...p, meters, rel }
		})
		.filter((p) => (!range || p.meters <= range) && Math.abs(p.rel) <= COMPASS_HALF_FOV)
		.slice(0, COMPASS_MAX_MARKERS)

	// Label the nearest few, skipping any that would sit on top of a label already placed
	const labelled: number[] = []
	const showLabel = nearby.map((p) => {
		const x = toX(p.rel)
		if (labelled.length >= COMPASS_LABELS || labelled.some((lx) => Math.abs(lx - x) < 56)) return false
		labelled.push(x)
		return true
	})

	const ticks: { rel: number; heading: number }[] = []
	for (let heading = 0; heading < 360; heading += 15) {
		const rel = wrap180(heading - pose.yaw)
		if (Math.abs(rel) <= COMPASS_HALF_FOV) ticks.push({ rel, heading })
	}

	return (
		<Box
			sx={{
				position: 'relative',
				width,
				height: COMPASS_HEIGHT,
				// Fades out at both ends instead of stopping at a hard edge
				maskImage: 'linear-gradient(to right, transparent, black 12%, black 88%, transparent)'
			}}
		>
			{prefs.compassBar && (
				<Box sx={{ position: 'absolute', left: 0, right: 0, top: 0, height: COMPASS_BAR, background: 'rgba(14,16,20,0.55)', borderRadius: 1 }} />
			)}
			{ticks.map(({ rel, heading }) => {
				const label = prefs.compassLetters ? CARDINALS[heading] : undefined
				if (!label && !prefs.compassTicks) return null
				return (
					<Box key={heading} sx={{ position: 'absolute', left: toX(rel), top: 0, transform: 'translateX(-50%)', textAlign: 'center' }}>
						{prefs.compassTicks && <Box sx={{ width: '2px', height: CARDINALS[heading] ? 10 : 6, mx: 'auto', bgcolor: CARDINALS[heading] ? '#e8ecf2' : 'rgba(232,236,242,0.5)' }} />}
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
					sx={{
						position: 'absolute',
						left: toX(p.rel),
						top: 14,
						transform: 'translateX(-50%)',
						textAlign: 'center',
						// Farther markers fade; with no range limit, the fade runs out at 1 km
						opacity: 1 - Math.min(1, p.meters / (range || 1000)) * 0.6,
						zIndex: COMPASS_MAX_MARKERS - i
					}}
				>
					{p.icon && <img src={asset(`map/icons/${p.icon}`)} width={COMPASS_ICON} height={COMPASS_ICON} style={{ filter: 'drop-shadow(0 1px 2px #000)' }} />}
					{showLabel[i] && (
						<Box sx={{ fontSize: 13, fontWeight: 700, color: '#e8ecf2', textShadow: '0 1px 3px #000', whiteSpace: 'nowrap', mt: -0.5 }}>{Math.round(p.meters)} m</Box>
					)}
				</Box>
			))}
			{/* Where you're looking */}
			{prefs.compassTicks && (
				<Box sx={{ position: 'absolute', left: '50%', top: 0, width: '2px', height: COMPASS_BAR, bgcolor: '#5cc8f0', transform: 'translateX(-50%)', boxShadow: '0 0 6px #5cc8f0' }} />
			)}
		</Box>
	)
}

function Minimap({ live, layerIds, size, zoom }: { live: LiveData; layerIds: string[]; size: number; zoom: number }) {
	const here = worldToPixel(live.x, live.y)
	const shown = useMemo(() => mapLayers.filter((l) => layerIds.includes(l.id)), [layerIds])
	return (
		<Box
			sx={{
				position: 'relative',
				width: size,
				height: size,
				borderRadius: '50%',
				overflow: 'hidden',
				border: '3px solid rgba(232,236,242,0.85)',
				boxShadow: '0 4px 18px rgba(0,0,0,0.6)',
				bgcolor: '#0e1014',
				'& .leaflet-container': { background: '#0e1014' }
			}}
		>
			<MapContainer
				// Remounted when the size changes so Leaflet re-measures
				key={`${here.map}-${zoom}-${size}`}
				crs={L.CRS.Simple}
				center={toLatLng(here.px, here.py)}
				zoom={zoom}
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
					<LayerMarkers key={l.id} layer={l} map={here.map} hideLooted />
				))}
				<PlayerMarker map={here.map} follow />
			</MapContainer>
			<Box sx={{ position: 'absolute', top: 4, left: '50%', transform: 'translateX(-50%)', zIndex: 1000, fontSize: 13, fontWeight: 800, color: '#f07a7a', textShadow: '0 1px 3px #000' }}>
				N
			</Box>
		</Box>
	)
}

/** In layout editing, a box that can be dragged by its body and resized by its bottom-right corner */
function Movable({
	editing,
	left,
	top,
	width,
	height,
	label,
	onMove,
	onResize,
	onDone,
	children
}: {
	editing: boolean
	left: number
	top: number
	width: number
	height: number
	label: string
	onMove: (left: number, top: number) => void
	onResize: (dx: number) => void
	onDone: () => void
	children: ReactNode
}) {
	const drag = useRef<{ x: number; y: number; left: number; top: number; resize: boolean } | null>(null)
	const start = (e: React.PointerEvent, resize: boolean) => {
		e.stopPropagation()
		;(e.target as HTMLElement).setPointerCapture(e.pointerId)
		drag.current = { x: e.clientX, y: e.clientY, left, top, resize }
	}
	const move = (e: React.PointerEvent) => {
		const d = drag.current
		if (!d) return
		if (d.resize) {
			onResize(e.clientX - d.x)
			d.x = e.clientX
		} else onMove(d.left + e.clientX - d.x, d.top + e.clientY - d.y)
	}
	const end = () => {
		if (!drag.current) return
		drag.current = null
		onDone()
	}
	return (
		<Box sx={{ position: 'absolute', left, top, width, height }}>
			{children}
			{editing && (
				<Box
					onPointerDown={(e) => start(e, false)}
					onPointerMove={move}
					onPointerUp={end}
					sx={{
						position: 'absolute',
						inset: -6,
						border: '2px dashed #5cc8f0',
						borderRadius: 1.5,
						bgcolor: 'rgba(92,200,240,0.08)',
						cursor: 'move',
						zIndex: 2000
					}}
				>
					<Box sx={{ position: 'absolute', top: -24, left: 0, px: 1, borderRadius: 1, bgcolor: '#5cc8f0', color: '#0e1014', fontSize: 12, fontWeight: 700 }}>
						{label}
					</Box>
					<Box
						onPointerDown={(e) => start(e, true)}
						onPointerMove={move}
						onPointerUp={end}
						title="Drag to resize"
						sx={{ position: 'absolute', right: -7, bottom: -7, width: 14, height: 14, borderRadius: '3px', bgcolor: '#5cc8f0', cursor: 'nwse-resize' }}
					/>
				</Box>
			)}
		</Box>
	)
}

/** The whole overlay window: transparent everywhere except the compass and minimap */
export function OverlayApp() {
	const { overlay, map, loaded } = useStore()
	const { live, connected, motion } = useBridge()
	const [editing, setEditing] = useState(false)
	// Positions while dragging; saved through the app when the drag ends
	const [draft, setDraft] = useState<OverlayLayout | null>(null)
	const [screen, setScreen] = useState({ w: window.innerWidth, h: window.innerHeight })
	const pose = useFramePose(motion, connected)

	useEffect(() => window.palOverlay?.onEditing((on) => setEditing(on)), [])
	useEffect(() => {
		const resize = () => setScreen({ w: window.innerWidth, h: window.innerHeight })
		window.addEventListener('resize', resize)
		return () => window.removeEventListener('resize', resize)
	}, [])
	useEffect(() => {
		if (!editing) return
		const key = (e: KeyboardEvent) => e.key === 'Escape' && void window.palOverlay?.edit(false)
		window.addEventListener('keydown', key)
		return () => window.removeEventListener('keydown', key)
	}, [editing])
	// A saved layout coming back from the app replaces the draft
	useEffect(() => setDraft(null), [overlay.compassX, overlay.compassY, overlay.compassWidth, overlay.minimapX, overlay.minimapY, overlay.size])

	if (!loaded) return null
	const layout: OverlayLayout = draft ?? overlay
	const commit = (next: OverlayLayout) => void window.palOverlay?.sendLayout(next)
	const current: Pose | null = pose ?? (editing ? PREVIEW_LIVE : null)
	// Hidden while a menu, inventory or chest is open, unless arranging the layout
	if (!current || (!editing && (!overlay.enabled || live?.ui))) return null

	const compass = {
		left: layout.compassX * screen.w - layout.compassWidth / 2,
		top: layout.compassY * screen.h
	}
	const minimap = {
		left: layout.minimapX == null ? screen.w - layout.size - MINIMAP_MARGIN : layout.minimapX * screen.w,
		top: layout.minimapY == null ? MINIMAP_MARGIN + (overlay.compass ? COMPASS_HEIGHT + 12 : 0) : layout.minimapY * screen.h
	}

	return (
		<Box sx={{ position: 'fixed', inset: 0, pointerEvents: editing ? 'auto' : 'none', fontFamily: 'Roboto, system-ui, sans-serif', bgcolor: editing ? 'rgba(0,0,0,0.35)' : 'transparent' }}>
			{overlay.compass && (
				<Movable
					editing={editing}
					label="Compass"
					{...compass}
					width={layout.compassWidth}
					height={COMPASS_HEIGHT}
					onMove={(left, top) => setDraft({ ...layout, compassX: (left + layout.compassWidth / 2) / screen.w, compassY: top / screen.h })}
					onResize={(dx) => setDraft({ ...layout, compassWidth: clamp(layout.compassWidth + dx * 2, COMPASS_WIDTH_RANGE) })}
					onDone={() => draft && commit(draft)}
				>
					<Compass pose={current} layerIds={map.layers} range={overlay.range} width={layout.compassWidth} prefs={overlay} />
				</Movable>
			)}
			{overlay.minimap && (
				<Movable
					editing={editing}
					label="Minimap"
					{...minimap}
					width={layout.size}
					height={layout.size}
					onMove={(left, top) => setDraft({ ...layout, minimapX: left / screen.w, minimapY: top / screen.h })}
					onResize={(dx) => setDraft({ ...layout, minimapX: minimap.left / screen.w, minimapY: minimap.top / screen.h, size: clamp(layout.size + dx, MINIMAP_SIZE_RANGE) })}
					onDone={() => draft && commit(draft)}
				>
					<Minimap live={pose ? (live ?? PREVIEW_LIVE) : PREVIEW_LIVE} layerIds={map.layers} size={layout.size} zoom={overlay.zoom} />
				</Movable>
			)}
			{editing && (
				<Paper
					elevation={8}
					sx={{
						position: 'absolute',
						left: '50%',
						top: '50%',
						transform: 'translate(-50%, -50%)',
						p: 2,
						display: 'flex',
						alignItems: 'center',
						gap: 2,
						bgcolor: 'rgba(27,30,38,0.95)'
					}}
				>
					<Typography variant="body2">Drag the compass and minimap where you want them. Drag a corner to resize.</Typography>
					<Button onClick={() => commit({ ...defaultLayout })}>Reset</Button>
					<Button variant="contained" onClick={() => void window.palOverlay?.edit(false)}>
						Done
					</Button>
				</Paper>
			)}
		</Box>
	)
}
