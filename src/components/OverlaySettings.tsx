import { useEffect, useState } from 'react'
import { Alert, Box, Button, MenuItem, Paper, Switch, TextField, Typography } from '@mui/material'
import EditIcon from '@mui/icons-material/OpenWith'
import { useBridge } from '../state/bridge'
import { COMPASS_RANGES, defaultLayout, useActions, useLoaded, useStoreSelect, type OverlayLayout } from '../state/store'
import { worldToPixel } from '../data/map'
import { asset } from './MapPage'
import { Compass, COMPASS_HEIGHT, MINIMAP_MARGIN, PREVIEW_LIVE } from './Overlay'

interface DisplayInfo {
	id: number
	label: string
	primary: boolean
	width: number
	height: number
}

declare global {
	interface Window {
		palOverlay?: {
			set(visible: boolean, display: number | null): Promise<void>
			edit(on: boolean): Promise<void>
			sendLayout(layout: OverlayLayout): Promise<void>
			displays(): Promise<DisplayInfo[]>
			hotkey(): Promise<string | null>
			onToggled(cb: (visible: boolean) => void): () => void
			onEditing(cb: (on: boolean) => void): () => void
			onLayout(cb: (layout: OverlayLayout) => void): () => void
		}
	}
}

/** Keeps the overlay window in step with the saved settings, and saves what the hotkey and layout editor change */
export function useOverlaySync() {
	const loaded = useLoaded()
	const overlay = useStoreSelect((s) => s.overlay)
	const { updateOverlay } = useActions()
	useEffect(() => {
		if (loaded) void window.palOverlay?.set(overlay.enabled, overlay.display)
	}, [loaded, overlay.enabled, overlay.display])
	useEffect(() => window.palOverlay?.onToggled((enabled) => updateOverlay({ enabled })), [updateOverlay])
	useEffect(() => window.palOverlay?.onLayout((layout) => updateOverlay(layout)), [updateOverlay])
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, py: 0.75 }}>
			<Typography variant="body2">{label}</Typography>
			{children}
		</Box>
	)
}

const selectSx = { width: 180 }

/** Your screen in miniature: the real compass and a minimap where the overlay puts them */
function LayoutPreview({ display }: { display: DisplayInfo | undefined }) {
	const overlay = useStoreSelect((s) => s.overlay)
	const map = useStoreSelect((s) => s.map)
	const w = display?.width ?? 1920
	const h = display?.height ?? 1080
	const scale = Math.min(560 / w, 320 / h)
	const minimapLeft = overlay.minimapX == null ? w - overlay.size - MINIMAP_MARGIN : overlay.minimapX * w
	const minimapTop = overlay.minimapY == null ? MINIMAP_MARGIN + (overlay.compass ? COMPASS_HEIGHT + 12 : 0) : overlay.minimapY * h
	// The minimap shows the map tile around the sample position, at the chosen zoom
	const here = worldToPixel(PREVIEW_LIVE.x, PREVIEW_LIVE.y)
	const tileScale = 2 ** (overlay.zoom - 4)
	const tileX = Math.floor(here.px / 512)
	const tileY = Math.floor(here.py / 512)
	return (
		<Box sx={{ width: w * scale, height: h * scale, borderRadius: 1, overflow: 'hidden', border: 1, borderColor: 'divider', position: 'relative' }}>
			<Box
				sx={{
					position: 'absolute',
					left: 0,
					top: 0,
					width: w,
					height: h,
					transform: `scale(${scale})`,
					transformOrigin: 'top left',
					// A stand-in for the game behind the overlay
					background: 'linear-gradient(180deg, #4d6a8a 0%, #7f98ad 38%, #5f7a55 40%, #3d5236 100%)'
				}}
			>
				{overlay.compass && (
					<Box sx={{ position: 'absolute', left: overlay.compassX * w - overlay.compassWidth / 2, top: overlay.compassY * h }}>
						<Compass pose={PREVIEW_LIVE} layerIds={map.layers} range={overlay.range} width={overlay.compassWidth} prefs={overlay} />
					</Box>
				)}
				{overlay.minimap && (
					<Box
						sx={{
							position: 'absolute',
							left: minimapLeft,
							top: minimapTop,
							width: overlay.size,
							height: overlay.size,
							borderRadius: '50%',
							border: '3px solid rgba(232,236,242,0.85)',
							boxShadow: '0 4px 18px rgba(0,0,0,0.6)',
							backgroundColor: '#0e1014',
							backgroundImage: `url(${asset(`map/main/z4x${tileX}y${tileY}.webp`)})`,
							backgroundSize: `${512 * tileScale}px`,
							backgroundPosition: `${overlay.size / 2 - (here.px - tileX * 512) * tileScale}px ${overlay.size / 2 - (here.py - tileY * 512) * tileScale}px`,
							backgroundRepeat: 'no-repeat'
						}}
					>
						<svg viewBox="0 0 34 34" width={34} height={34} style={{ position: 'absolute', left: overlay.size / 2 - 17, top: overlay.size / 2 - 17 }}>
							<path d="M17 4 L26 27 L17 22 L8 27 Z" fill="#5cc8f0" stroke="#ffffff" strokeWidth={1.5} strokeLinejoin="round" />
						</svg>
					</Box>
				)}
			</Box>
		</Box>
	)
}

export function OverlayPage() {
	const overlay = useStoreSelect((s) => s.overlay)
	const { updateOverlay } = useActions()
	const { connected } = useBridge()
	const [hotkey, setHotkey] = useState<string | null>(null)
	const [displays, setDisplays] = useState<DisplayInfo[]>([])
	const [editing, setEditing] = useState(false)

	useEffect(() => {
		window.palOverlay?.hotkey().then(setHotkey)
		window.palOverlay?.displays().then(setDisplays)
		return window.palOverlay?.onEditing(setEditing)
	}, [])

	if (!window.palOverlay) {
		return (
			<Paper variant="outlined" sx={{ p: 3 }}>
				<Typography variant="body2">The overlay works in the desktop app.</Typography>
			</Paper>
		)
	}

	const display = displays.find((d) => d.id === overlay.display) ?? displays.find((d) => d.primary)

	return (
		<Paper variant="outlined" sx={{ height: '100%', overflowY: 'auto', p: 3 }}>
			<Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 420px) 1fr', gap: 4, maxWidth: 1100 }}>
				<Box>
					<Typography variant="h6" sx={{ mb: 1 }}>
						Overlay
					</Typography>
					<Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
						A compass and minimap drawn over the game. Needs the game link and Palworld in borderless or windowed mode. It hides while a menu is open
						and when the game isn't the window in front.
					</Typography>
					{!connected && (
						<Alert severity="info" sx={{ mb: 2, py: 0 }}>
							Waiting for the game link.
						</Alert>
					)}
					<Row label="Show Over the Game">
						<Switch checked={overlay.enabled} onChange={(e) => updateOverlay({ enabled: e.target.checked })} />
					</Row>
					{hotkey && (
						<Typography variant="caption" color="text.secondary" component="div" sx={{ mt: -0.5, mb: 1 }}>
							{hotkey} toggles it in game.
						</Typography>
					)}
					{displays.length > 1 && (
						<Row label="Screen">
							<TextField
								select
								size="small"
								value={display?.id ?? ''}
								onChange={(e) => updateOverlay({ display: Number(e.target.value) })}
								sx={selectSx}
							>
								{displays.map((d) => (
									<MenuItem key={d.id} value={d.id}>
										{d.width}x{d.height}
										{d.primary ? ' (main)' : ''}
									</MenuItem>
								))}
							</TextField>
						</Row>
					)}
					<Row label="Compass">
						<Switch checked={overlay.compass} onChange={(e) => updateOverlay({ compass: e.target.checked })} />
					</Row>
					{overlay.compass && (
						<>
							<Row label="Background">
								<Switch checked={overlay.compassBar} onChange={(e) => updateOverlay({ compassBar: e.target.checked })} />
							</Row>
							<Row label="Tick Marks and Center Line">
								<Switch checked={overlay.compassTicks} onChange={(e) => updateOverlay({ compassTicks: e.target.checked })} />
							</Row>
							<Row label="Direction Letters">
								<Switch checked={overlay.compassLetters} onChange={(e) => updateOverlay({ compassLetters: e.target.checked })} />
							</Row>
							{!overlay.compassBar && !overlay.compassTicks && !overlay.compassLetters && (
								<Typography variant="caption" color="text.secondary" component="div" sx={{ mt: -0.5 }}>
									Only the marker icons show. Line them up over the game's own compass with Edit layout.
								</Typography>
							)}
						</>
					)}
					{overlay.compass && (
						<Row label="Compass Range">
							<TextField select size="small" value={overlay.range} onChange={(e) => updateOverlay({ range: Number(e.target.value) })} sx={selectSx}>
								{COMPASS_RANGES.map((m) => (
									<MenuItem key={m} value={m}>
										{m ? `${m} m` : 'Unlimited'}
									</MenuItem>
								))}
							</TextField>
						</Row>
					)}
					<Row label="Minimap">
						<Switch checked={overlay.minimap} onChange={(e) => updateOverlay({ minimap: e.target.checked })} />
					</Row>
					{overlay.minimap && (
						<Row label="Minimap Zoom">
							<TextField select size="small" value={overlay.zoom} onChange={(e) => updateOverlay({ zoom: Number(e.target.value) })} sx={selectSx}>
								<MenuItem value={5}>Close</MenuItem>
								<MenuItem value={4}>Medium</MenuItem>
								<MenuItem value={3}>Far</MenuItem>
							</TextField>
						</Row>
					)}
					{overlay.minimap && (
						<Row label="Nearby Wild Pals">
							<Switch checked={overlay.wildPals} onChange={(e) => updateOverlay({ wildPals: e.target.checked })} />
						</Row>
					)}
					<Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 1 }}>
						Both show the markers turned on in the Map tab.
					</Typography>
				</Box>
				<Box>
					<Typography variant="subtitle2" sx={{ mb: 1 }}>
						Layout
					</Typography>
					<LayoutPreview display={display} />
					<Box sx={{ display: 'flex', gap: 1, mt: 1.5 }}>
						<Button variant="contained" startIcon={<EditIcon />} onClick={() => window.palOverlay?.edit(!editing)}>
							{editing ? 'Finish Editing' : 'Edit Layout'}
						</Button>
						<Button onClick={() => updateOverlay({ ...defaultLayout })}>Reset Layout</Button>
					</Box>
					<Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 1 }}>
						Opens the overlay on screen so you can drag the compass and minimap into place and resize them by their corners. Press Done or Esc when
						finished.
					</Typography>
				</Box>
			</Box>
		</Paper>
	)
}
