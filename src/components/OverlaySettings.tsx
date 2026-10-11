import { useEffect, useState } from 'react'
import { Box, MenuItem, Switch, TextField, Typography } from '@mui/material'
import { COMPASS_RANGES, useStore, type OverlayCorner } from '../state/store'

declare global {
	interface Window {
		palOverlay?: {
			set(visible: boolean): Promise<void>
			hotkey(): Promise<string | null>
			onToggled(cb: (visible: boolean) => void): () => void
		}
	}
}

/** Keeps the overlay window in step with the saved switch, and the switch in step with the hotkey */
export function useOverlaySync() {
	const { loaded, overlay, updateOverlay } = useStore()
	useEffect(() => {
		if (loaded) void window.palOverlay?.set(overlay.enabled)
	}, [loaded, overlay.enabled])
	useEffect(() => window.palOverlay?.onToggled((enabled) => updateOverlay({ enabled })), [updateOverlay])
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, py: 0.25 }}>
			<Typography variant="body2">{label}</Typography>
			{children}
		</Box>
	)
}

const selectSx = { width: 130, '& .MuiSelect-select': { py: 0.5 } }

export function OverlaySettings() {
	const { overlay, updateOverlay } = useStore()
	const [hotkey, setHotkey] = useState<string | null>(null)
	useEffect(() => {
		window.palOverlay?.hotkey().then(setHotkey)
	}, [])

	if (!window.palOverlay) return null

	return (
		<Box>
			<Typography variant="overline" color="text.secondary">
				Overlay
			</Typography>
			<Row label="Show over the game">
				<Switch size="small" checked={overlay.enabled} onChange={(e) => updateOverlay({ enabled: e.target.checked })} />
			</Row>
			<Typography variant="caption" color="text.secondary" component="div" sx={{ mb: 0.5 }}>
				{hotkey ? `${hotkey} toggles it in game. ` : ''}Needs Palworld in borderless or windowed mode. Shows the markers turned on below.
			</Typography>
			<Row label="Compass">
				<Switch size="small" checked={overlay.compass} onChange={(e) => updateOverlay({ compass: e.target.checked })} />
			</Row>
			{overlay.compass && (
				<Row label="Compass range">
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
				<Switch size="small" checked={overlay.minimap} onChange={(e) => updateOverlay({ minimap: e.target.checked })} />
			</Row>
			{overlay.minimap && (
				<>
					<Row label="Corner">
						<TextField select size="small" value={overlay.corner} onChange={(e) => updateOverlay({ corner: e.target.value as OverlayCorner })} sx={selectSx}>
							<MenuItem value="top-right">Top right</MenuItem>
							<MenuItem value="bottom-right">Bottom right</MenuItem>
							<MenuItem value="bottom-left">Bottom left</MenuItem>
							<MenuItem value="top-left">Top left</MenuItem>
						</TextField>
					</Row>
					<Row label="Size">
						<TextField select size="small" value={overlay.size} onChange={(e) => updateOverlay({ size: Number(e.target.value) })} sx={selectSx}>
							<MenuItem value={180}>Small</MenuItem>
							<MenuItem value={240}>Medium</MenuItem>
							<MenuItem value={320}>Large</MenuItem>
						</TextField>
					</Row>
					<Row label="Zoom">
						<TextField select size="small" value={overlay.zoom} onChange={(e) => updateOverlay({ zoom: Number(e.target.value) })} sx={selectSx}>
							<MenuItem value={5}>Close</MenuItem>
							<MenuItem value={4}>Medium</MenuItem>
							<MenuItem value={3}>Far</MenuItem>
						</TextField>
					</Row>
				</>
			)}
		</Box>
	)
}
