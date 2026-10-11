import { useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import {
	Box,
	Button,
	Checkbox,
	Chip,
	Collapse,
	IconButton,
	InputAdornment,
	Paper,
	Switch,
	TextField,
	ToggleButton,
	ToggleButtonGroup,
	Tooltip,
	Typography
} from '@mui/material'
import SearchIcon from '@mui/icons-material/Search'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import CloseIcon from '@mui/icons-material/Close'
import MyLocationIcon from '@mui/icons-material/MyLocation'
import { getPal, pals } from '../data/gamedata'
import { CATEGORY_NAMES, CATEGORY_ORDER, HABITAT, layerPoints, MAP_SIZE, mapLayers, palHabitat, pixelToIngame, worldToPixel, type MapIndex, type MapLayer } from '../data/map'
import { CATCH_TARGET } from '../data/paldeck'
import { REGIONS, regionName, spawnRegions } from '../data/regions'
import { useStore } from '../state/store'
import { useBridge } from '../state/bridge'
import { theme } from '../theme'
import { PalAvatar } from './bits'
import { PalPicker } from './pickers'

const asset = (file: string) => `${import.meta.env.BASE_URL}${file}`

// Leaflet's simple CRS: at zoom 0 the 512 px top tile spans 512 map units, so an 8192 image pixel
// is 1/16 of a unit. Latitude runs up, so image rows are negated.
const UNIT = MAP_SIZE / 512
const toLatLng = (px: number, py: number): L.LatLngTuple => [-py / UNIT, px / UNIT]
const BOUNDS: L.LatLngBoundsExpression = [
	[-512, 0],
	[0, 512]
]

const HABITAT_COLORS = { day: '#f0c35c', night: '#8f8cf0', both: '#5cc8f0', alpha: '#f07a7a' }

// Marker icons are loaded once up front so the canvas can draw them synchronously
const iconImages = new Map<string, HTMLImageElement>()
function loadIcons(): Promise<void> {
	const names = [...new Set(mapLayers.map((l) => l.icon).filter((n): n is string => !!n))]
	return Promise.all(
		names.map(
			(name) =>
				new Promise<void>((resolve) => {
					const img = new Image()
					img.onload = img.onerror = () => resolve()
					img.src = asset(`map/icons/${name}.webp`)
					iconImages.set(name, img)
				})
		)
	).then(() => undefined)
}

/** A marker the canvas renderer draws as an image; thousands stay smooth, unlike DOM markers */
const IconMarker = L.CircleMarker.extend({
	_updatePath(this: L.CircleMarker & { _renderer: { _ctx: CanvasRenderingContext2D; _drawing: boolean }; _point: L.Point; _map: L.Map; options: { image?: HTMLImageElement } }) {
		// Leaflet also calls this outside a redraw pass; only paint during one, as its own circles do
		if (!this._renderer._drawing) return
		const img = this.options.image
		if (!img?.complete || !img.naturalWidth) return
		const zoom = this._map.getZoom()
		const size = zoom <= 0 ? 12 : zoom <= 1 ? 16 : zoom <= 2 ? 20 : 26
		this._renderer._ctx.drawImage(img, this._point.x - size / 2, this._point.y - size / 2, size, size)
	}
}) as unknown as new (latlng: L.LatLngExpression, options: L.CircleMarkerOptions & { image?: HTMLImageElement }) => L.CircleMarker

function LayerMarkers({ layer, map }: { layer: MapLayer; map: MapIndex }) {
	const leaflet = useMap()
	useEffect(() => {
		const image = layer.icon ? iconImages.get(layer.icon) : undefined
		const group = L.layerGroup()
		for (const p of layerPoints(layer, map)) {
			const marker = image
				? new IconMarker(toLatLng(p.px, p.py), { radius: 9, stroke: false, fill: false, image })
				: L.circleMarker(toLatLng(p.px, p.py), { radius: 5, color: theme.palette.primary.main, weight: 2, fillOpacity: 0.6 })
			marker.bindTooltip(p.label ? `${p.label} (${layer.name})` : layer.name, { direction: 'top', offset: [0, -8] })
			group.addLayer(marker)
		}
		group.addTo(leaflet)
		return () => {
			group.remove()
		}
	}, [leaflet, layer, map])
	return null
}

/** Habitat points are thinned to a grid this many map units wide */
const HABITAT_CELL = 24 / UNIT

/** Circles about one habitat cell across, so they grow with zoom but never shrink out of sight */
const habitatRadius = (zoom: number, alpha: boolean) => Math.max(alpha ? 7 : 4, HABITAT_CELL * 0.6 * 2 ** zoom) + (alpha ? 3 : 0)

/** Where one pal lives: day, night and alpha spots from the game's Paldeck habitat data */
function PalHabitat({ palId, map }: { palId: string; map: MapIndex }) {
	const leaflet = useMap()
	useEffect(() => {
		const flat = palHabitat[palId] ?? []
		const group = L.layerGroup()
		const circles: { marker: L.CircleMarker; alpha: boolean }[] = []
		for (let i = 0; i < flat.length; i += 4) {
			if (flat[i] !== map) continue
			const f = flat[i + 3]
			const alpha = !!(f & HABITAT.ALPHA)
			const color = alpha
				? HABITAT_COLORS.alpha
				: (f & 3) === 3
					? HABITAT_COLORS.both
					: f & HABITAT.NIGHT
						? HABITAT_COLORS.night
						: HABITAT_COLORS.day
			const marker = L.circleMarker(toLatLng(flat[i + 1], flat[i + 2]), {
				radius: habitatRadius(leaflet.getZoom(), alpha),
				color,
				weight: alpha ? 2.5 : 1,
				fillColor: color,
				fillOpacity: alpha ? 0.15 : 0.45
			}).addTo(group)
			circles.push({ marker, alpha })
		}
		const resize = () => {
			const zoom = leaflet.getZoom()
			for (const c of circles) c.marker.setRadius(habitatRadius(zoom, c.alpha))
		}
		group.addTo(leaflet)
		leaflet.on('zoomend', resize)
		return () => {
			leaflet.off('zoomend', resize)
			group.remove()
		}
	}, [leaflet, palId, map])
	return null
}

/** Shades areas by how many pals you still need to catch live there */
function UncaughtShading({ map, palIds }: { map: MapIndex; palIds: string[] }) {
	const leaflet = useMap()
	useEffect(() => {
		const CELL = 256
		const cells = new Map<string, { px: number; py: number; pals: Set<string> }>()
		for (const palId of palIds) {
			const flat = palHabitat[palId] ?? []
			for (let i = 0; i < flat.length; i += 4) {
				if (flat[i] !== map) continue
				const cx = Math.floor(flat[i + 1] / CELL)
				const cy = Math.floor(flat[i + 2] / CELL)
				const key = `${cx}:${cy}`
				let cell = cells.get(key)
				if (!cell) cells.set(key, (cell = { px: (cx + 0.5) * CELL, py: (cy + 0.5) * CELL, pals: new Set() }))
				cell.pals.add(palId)
			}
		}
		const max = Math.max(1, ...[...cells.values()].map((c) => c.pals.size))
		const group = L.layerGroup()
		for (const cell of cells.values()) {
			// Squared so busy areas stand out instead of the whole map shading evenly
			const share = (cell.pals.size / max) ** 2
			const names = [...cell.pals].map((id) => getPal(id).name).sort()
			L.circle(toLatLng(cell.px, cell.py), {
				radius: (CELL / UNIT) * 0.6,
				stroke: false,
				fillColor: share > 0.66 ? '#f07a7a' : share > 0.33 ? '#f0a85c' : '#f0d45c',
				fillOpacity: 0.06 + share * 0.5
			})
				.bindTooltip(
					`<b>${names.length} to catch</b><br>${names.slice(0, 10).join(', ')}${names.length > 10 ? `, +${names.length - 10} more` : ''}`,
					{ sticky: true }
				)
				.addTo(group)
		}
		group.addTo(leaflet)
		return () => {
			group.remove()
		}
	}, [leaflet, map, palIds])
	return null
}

/** Moves the view to a pal's habitat whenever the focus changes */
function FitToPal({ palId, map, nonce }: { palId: string | null; map: MapIndex; nonce: number }) {
	const leaflet = useMap()
	useEffect(() => {
		if (!palId) return
		const flat = palHabitat[palId] ?? []
		const points: L.LatLngTuple[] = []
		for (let i = 0; i < flat.length; i += 4) if (flat[i] === map) points.push(toLatLng(flat[i + 1], flat[i + 2]))
		if (points.length) leaflet.flyToBounds(L.latLngBounds(points).pad(0.3), { maxZoom: 3, duration: 0.6 })
	}, [leaflet, palId, map, nonce])
	return null
}

const PLAYER_ICON = L.divIcon({
	className: '',
	iconSize: [34, 34],
	iconAnchor: [17, 17],
	html: `<div class="pb-player" style="width:34px;height:34px;filter:drop-shadow(0 0 4px rgba(0,0,0,0.8))">
		<svg viewBox="0 0 34 34" width="34" height="34">
			<circle cx="17" cy="17" r="15" fill="rgba(92,200,240,0.18)" stroke="rgba(92,200,240,0.6)" stroke-width="1.5"/>
			<path d="M17 4 L26 27 L17 22 L8 27 Z" fill="#5cc8f0" stroke="#ffffff" stroke-width="1.5" stroke-linejoin="round"/>
		</svg>
	</div>`
})

/** You, live from the game; the arrow turns with your camera */
function PlayerMarker({ map, follow }: { map: MapIndex; follow: boolean }) {
	const leaflet = useMap()
	const { live, connected } = useBridge()
	const marker = useRef<L.Marker | null>(null)
	const pos = live && connected ? worldToPixel(live.x, live.y) : null
	const here = pos && pos.map === map ? toLatLng(pos.px, pos.py) : null

	useEffect(() => {
		if (!here) {
			marker.current?.remove()
			marker.current = null
			return
		}
		if (!marker.current) {
			marker.current = L.marker(here, { icon: PLAYER_ICON, interactive: false, zIndexOffset: 1000, keyboard: false }).addTo(leaflet)
		} else marker.current.setLatLng(here)
		const arrow = marker.current.getElement()?.querySelector<HTMLElement>('.pb-player')
		// Unreal yaw 0 faces +X, which is up on the map; it grows clockwise
		if (arrow) arrow.style.transform = `rotate(${live!.yaw}deg)`
		// A hidden map has no size; panning it then would corrupt the view
		if (follow && leaflet.getSize().x > 0) leaflet.panTo(here, { animate: true, duration: 0.15, easeLinearity: 1 })
	})
	useEffect(
		() => () => {
			marker.current?.remove()
			marker.current = null
		},
		[]
	)
	return null
}

/** Leaflet measures its container once; re-measure whenever the Map tab is shown again */
function ResizeWhenShown({ visible }: { visible: boolean }) {
	const leaflet = useMap()
	useEffect(() => {
		if (visible) leaflet.invalidateSize({ pan: false })
	}, [leaflet, visible])
	return null
}

function CoordinateReadout({ map }: { map: MapIndex }) {
	const [pos, setPos] = useState<[number, number] | null>(null)
	useMapEvents({
		mousemove: (e) => setPos(pixelToIngame(map, e.latlng.lng * UNIT, -e.latlng.lat * UNIT)),
		mouseout: () => setPos(null)
	})
	if (!pos) return null
	return (
		<Box
			sx={{
				position: 'absolute',
				left: 12,
				bottom: 12,
				zIndex: 1000,
				px: 1,
				py: 0.25,
				borderRadius: 1,
				bgcolor: 'rgba(20,22,28,0.85)',
				fontVariantNumeric: 'tabular-nums',
				pointerEvents: 'none'
			}}
		>
			<Typography variant="caption" fontWeight={600}>
				{Math.round(pos[0])}, {Math.round(pos[1])}
			</Typography>
		</Box>
	)
}

function LayerList({ map }: { map: MapIndex }) {
	const { map: prefs, updateMap } = useStore()
	const [search, setSearch] = useState('')
	const [open, setOpen] = useState<Set<string>>(new Set(['Collectibles', 'Resource']))
	const on = new Set(prefs.layers)

	const groups = useMemo(() => {
		const q = search.trim().toLowerCase()
		const counted = mapLayers
			.map((l) => ({ layer: l, count: layerPoints(l, map).length }))
			.filter((l) => l.count > 0 && (!q || l.layer.name.toLowerCase().includes(q)))
		return CATEGORY_ORDER.map((cat) => ({ cat, items: counted.filter((l) => l.layer.category === cat).sort((a, b) => a.layer.name.localeCompare(b.layer.name)) })).filter(
			(g) => g.items.length
		)
	}, [map, search])

	const toggle = (id: string) => {
		const next = new Set(on)
		if (next.has(id)) next.delete(id)
		else next.add(id)
		updateMap({ layers: [...next] })
	}

	return (
		<Box>
			<Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 1 }}>
				<TextField
					size="small"
					fullWidth
					placeholder="Find a marker type"
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					slotProps={{
						input: {
							startAdornment: (
								<InputAdornment position="start">
									<SearchIcon fontSize="small" />
								</InputAdornment>
							)
						}
					}}
				/>
				{on.size > 0 && (
					<Button size="small" onClick={() => updateMap({ layers: [] })} sx={{ whiteSpace: 'nowrap' }}>
						Hide all
					</Button>
				)}
			</Box>
			{groups.map(({ cat, items }) => {
				const expanded = open.has(cat) || !!search
				const shown = items.filter((i) => on.has(i.layer.id)).length
				return (
					<Box key={cat} sx={{ mb: 0.5 }}>
						<Box
							onClick={() => setOpen((s) => (s.has(cat) ? new Set([...s].filter((c) => c !== cat)) : new Set([...s, cat])))}
							sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5, cursor: 'pointer', userSelect: 'none' }}
						>
							<ExpandMoreIcon fontSize="small" sx={{ transform: expanded ? 'none' : 'rotate(-90deg)', transition: 'transform 150ms', color: 'text.secondary' }} />
							<Typography variant="subtitle2" sx={{ flex: 1 }}>
								{CATEGORY_NAMES[cat] ?? cat}
							</Typography>
							{shown > 0 && <Chip size="small" label={shown} color="primary" sx={{ height: 18, fontSize: 11 }} />}
						</Box>
						<Collapse in={expanded}>
							{items.map(({ layer, count }) => (
								<Box
									key={layer.id}
									onClick={() => toggle(layer.id)}
									sx={{
										display: 'flex',
										alignItems: 'center',
										gap: 1,
										pl: 3,
										pr: 0.5,
										py: 0.25,
										borderRadius: 1,
										cursor: 'pointer',
										'&:hover': { bgcolor: 'action.hover' }
									}}
								>
									<Checkbox size="small" checked={on.has(layer.id)} disableRipple sx={{ p: 0.25 }} />
									{layer.icon ? (
										<img src={asset(`map/icons/${layer.icon}.webp`)} alt="" width={20} height={20} />
									) : (
										<Box sx={{ width: 20 }} />
									)}
									<Typography variant="body2" sx={{ flex: 1 }} noWrap title={layer.random ? 'Appears at one of these spots at a time' : undefined}>
										{layer.name}
									</Typography>
									<Typography variant="caption" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums' }}>
										{count}
									</Typography>
								</Box>
							))}
						</Collapse>
					</Box>
				)
			})}
		</Box>
	)
}

export function MapPage({ focus, visible }: { focus: { palId: string; nonce: number } | null; visible: boolean }) {
	const { catches, map: prefs, updateMap, settings } = useStore()
	const [map, setMap] = useState<MapIndex>(0)
	const [ready, setReady] = useState(false)
	const [palId, setPalId] = useState<string | null>(null)
	const [fitNonce, setFitNonce] = useState(0)
	const [follow, setFollow] = useState(false)
	const { live, connected } = useBridge()
	const playerMap = live && connected ? worldToPixel(live.x, live.y).map : null

	// While following, show whichever map you're on
	useEffect(() => {
		if (follow && playerMap != null && playerMap !== map) setMap(playerMap)
	}, [follow, playerMap, map])
	const lastFocus = useRef<number | null>(null)

	useEffect(() => {
		loadIcons().then(() => setReady(true))
	}, [])

	// A pal opened from the Paldeck: show its habitat on whichever map holds most of it
	useEffect(() => {
		if (!focus || focus.nonce === lastFocus.current) return
		lastFocus.current = focus.nonce
		const flat = palHabitat[focus.palId] ?? []
		let onTree = 0
		for (let i = 0; i < flat.length; i += 4) if (flat[i] === 1) onTree++
		setMap(onTree > flat.length / 8 ? 1 : 0)
		setPalId(focus.palId)
		setFitNonce((n) => n + 1)
	}, [focus])

	const uncaught = useMemo(
		() => pals.filter((p) => (catches[p.id] ?? 0) < CATCH_TARGET && palHabitat[p.id]?.length).map((p) => p.id),
		[catches]
	)

	// Regions ranked by how many still-needed pals spawn there (skipping regions turned off in Map access)
	const regionRanking = useMemo(() => {
		const counts = new Map<string, number>()
		for (const id of uncaught) for (const r of spawnRegions(id)) if (r !== 'other' && !settings.disabledRegions.includes(r)) counts.set(r, (counts.get(r) ?? 0) + 1)
		return REGIONS.filter((r) => counts.get(r.key)).sort((a, b) => counts.get(b.key)! - counts.get(a.key)!).slice(0, 6).map((r) => ({ key: r.key, count: counts.get(r.key)! }))
	}, [uncaught, settings.disabledRegions])

	const shownLayers = useMemo(() => mapLayers.filter((l) => prefs.layers.includes(l.id)), [prefs.layers])
	const tileUrl = asset(`map/${map === 0 ? 'main' : 'worldTree'}/z{z}x{x}y{y}.webp`)

	return (
		<Paper variant="outlined" sx={{ height: '100%', minHeight: 0, display: 'grid', gridTemplateColumns: '300px 1fr', overflow: 'hidden' }}>
			<Box sx={{ borderRight: 1, borderColor: 'divider', overflowY: 'auto', p: 1.5, display: 'flex', flexDirection: 'column', gap: 2 }}>
				<ToggleButtonGroup size="small" exclusive fullWidth value={map} onChange={(_, v: MapIndex | null) => v != null && setMap(v)}>
					<ToggleButton value={0}>Palpagos</ToggleButton>
					<ToggleButton value={1}>World Tree</ToggleButton>
				</ToggleButtonGroup>

				<Box>
					<Typography variant="overline" color="text.secondary">
						Pals
					</Typography>
					<Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
						<Box sx={{ flex: 1 }}>
							<PalPicker
								value={palId}
								label="Show where a pal lives"
								onChange={(id) => {
									setPalId(id)
									setFitNonce((n) => n + 1)
								}}
							/>
						</Box>
						{palId && (
							<IconButton size="small" title="Clear" onClick={() => setPalId(null)}>
								<CloseIcon fontSize="small" />
							</IconButton>
						)}
					</Box>
					{palId && (
						<Box sx={{ display: 'flex', gap: 1.5, mt: 1, flexWrap: 'wrap' }}>
							{(
								[
									['Day', HABITAT_COLORS.day],
									['Night', HABITAT_COLORS.night],
									['Day and night', HABITAT_COLORS.both],
									['Alpha', HABITAT_COLORS.alpha]
								] as const
							).map(([label, color]) => (
								<Box key={label} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
									<Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: color }} />
									<Typography variant="caption">{label}</Typography>
								</Box>
							))}
						</Box>
					)}
					<Box sx={{ display: 'flex', alignItems: 'center', mt: 1.5 }}>
						<Typography variant="body2" sx={{ flex: 1 }}>
							Shade where uncaught pals live
						</Typography>
						<Switch size="small" checked={prefs.uncaught} onChange={(e) => updateMap({ uncaught: e.target.checked })} />
					</Box>
					<Typography variant="caption" color="text.secondary">
						{uncaught.length} pals still need {CATCH_TARGET} catches.
					</Typography>
					{prefs.uncaught && regionRanking.length > 0 && (
						<Box sx={{ mt: 1 }}>
							{regionRanking.map((r) => (
								<Box key={r.key} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.25 }}>
									<Typography variant="body2">{regionName(r.key)}</Typography>
									<Typography variant="body2" fontWeight={700} sx={{ fontVariantNumeric: 'tabular-nums' }}>
										{r.count}
									</Typography>
								</Box>
							))}
						</Box>
					)}
				</Box>

				<Box>
					<Typography variant="overline" color="text.secondary">
						Markers
					</Typography>
					<LayerList map={map} />
				</Box>
			</Box>

			<Box sx={{ position: 'relative', minHeight: 0, bgcolor: '#0e1014', '& .leaflet-container': { background: '#0e1014', fontFamily: 'inherit' } }}>
				<MapContainer
					key={map}
					crs={L.CRS.Simple}
					bounds={BOUNDS}
					maxBounds={[
						[-640, -128],
						[128, 640]
					]}
					minZoom={0}
					maxZoom={6}
					zoomSnap={0.25}
					attributionControl={false}
					// Markers draw on the map's canvas; IconMarker relies on it
					preferCanvas
					style={{ height: '100%', width: '100%' }}
				>
					<TileLayer url={tileUrl} tileSize={512} minNativeZoom={0} maxNativeZoom={4} noWrap bounds={BOUNDS} />
					{ready && shownLayers.map((l) => <LayerMarkers key={l.id} layer={l} map={map} />)}
					{prefs.uncaught && <UncaughtShading map={map} palIds={uncaught} />}
					{palId && <PalHabitat palId={palId} map={map} />}
					<FitToPal palId={palId} map={map} nonce={fitNonce} />
					<CoordinateReadout map={map} />
					<PlayerMarker map={map} follow={follow} />
					<ResizeWhenShown visible={visible} />
				</MapContainer>
				{connected && (
					<Button
						size="small"
						variant={follow ? 'contained' : 'outlined'}
						startIcon={<MyLocationIcon />}
						onClick={() => setFollow((f) => !f)}
						sx={{ position: 'absolute', top: 12, right: 12, zIndex: 1000, bgcolor: follow ? undefined : 'rgba(20,22,28,0.85)' }}
					>
						{follow ? 'Following you' : 'Follow me'}
					</Button>
				)}
				{palId && (
					<Box
						sx={{
							position: 'absolute',
							top: 12,
							left: 56,
							zIndex: 1000,
							display: 'flex',
							alignItems: 'center',
							gap: 1,
							px: 1.25,
							py: 0.75,
							borderRadius: 2,
							bgcolor: 'rgba(20,22,28,0.9)',
							border: 1,
							borderColor: 'divider'
						}}
					>
						<PalAvatar palId={palId} size={28} />
						<Box>
							<Typography variant="body2" fontWeight={700}>
								{getPal(palId).name}
							</Typography>
							<Typography variant="caption" color="text.secondary">
								{palHabitat[palId]?.length ? spawnRegions(palId).map(regionName).join(', ') : 'No wild habitat'}
							</Typography>
						</Box>
						<Tooltip title={`${catches[palId] ?? 0} of ${CATCH_TARGET} caught`}>
							<Chip
								size="small"
								label={`${Math.min(catches[palId] ?? 0, CATCH_TARGET)}/${CATCH_TARGET}`}
								color={(catches[palId] ?? 0) >= CATCH_TARGET ? 'success' : 'default'}
								variant="outlined"
							/>
						</Tooltip>
					</Box>
				)}
			</Box>
		</Paper>
	)
}
