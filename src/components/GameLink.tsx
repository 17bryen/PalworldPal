import { useEffect, useState, type ReactNode } from 'react'
import {
	Alert,
	Box,
	Button,
	Chip,
	CircularProgress,
	Dialog,
	DialogActions,
	DialogContent,
	DialogTitle,
	FormControlLabel,
	Switch,
	Typography
} from '@mui/material'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked'
import { MAPS, pixelToIngame, worldToPixel } from '../data/map'
import { bridgeApi, useBridge, useLive, type GameLinkStatus } from '../state/bridge'
import { useStore } from '../state/store'

function Step({ done, title, children }: { done: boolean; title: string; children?: ReactNode }) {
	return (
		<Box sx={{ display: 'flex', gap: 1.5, py: 1.25, borderBottom: 1, borderColor: 'divider', '&:last-of-type': { borderBottom: 0 } }}>
			{done ? <CheckCircleIcon color="success" /> : <RadioButtonUncheckedIcon color="disabled" />}
			<Box sx={{ flex: 1, minWidth: 0 }}>
				<Typography variant="subtitle2">{title}</Typography>
				{children}
			</Box>
		</Box>
	)
}

function GameLinkDialog({ onClose }: { onClose: () => void }) {
	const { connected, captures } = useBridge()
	const live = useLive()
	const { syncCatches, setSyncCatches } = useStore()
	const [status, setStatus] = useState<GameLinkStatus | null>(null)
	const [busy, setBusy] = useState(false)
	const [error, setError] = useState<string | null>(null)

	const run = async (action: () => Promise<GameLinkStatus>) => {
		setBusy(true)
		setError(null)
		try {
			setStatus(await action())
		} catch (e) {
			// IPC errors arrive as "Error invoking remote method '...': Error: <message>"
			setError(String(e instanceof Error ? e.message : e).replace(/^.*Error: /, ''))
		} finally {
			setBusy(false)
		}
	}

	useEffect(() => {
		if (bridgeApi) void run(() => bridgeApi!.status())
	}, [])

	if (!bridgeApi) {
		return (
			<Dialog open onClose={onClose} maxWidth="sm" fullWidth>
				<DialogTitle>Game Link</DialogTitle>
				<DialogContent>
					<Typography variant="body2">The game link works in the desktop app.</Typography>
				</DialogContent>
				<DialogActions>
					<Button onClick={onClose}>Close</Button>
				</DialogActions>
			</Dialog>
		)
	}

	const modCurrent = !!status?.modVersion && status.modVersion === status.bundledVersion
	const here = live ? worldToPixel(live.x, live.y) : null
	const coords = here ? pixelToIngame(here.map, here.px, here.py).map(Math.round) : null

	return (
		<Dialog open onClose={onClose} maxWidth="sm" fullWidth>
			<DialogTitle>Game Link</DialogTitle>
			<DialogContent dividers>
				<Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
					A small client-side mod shares your position and Paldeck catches with this app. It works on servers that don't have it.
					Don't use it on official servers.
				</Typography>
				{error && (
					<Alert severity="error" sx={{ my: 1 }}>
						{error}
					</Alert>
				)}
				{!status ? (
					<Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
						<CircularProgress size={28} />
					</Box>
				) : (
					<Box>
						<Step done={!!status.gamePath} title="Palworld">
							<Typography variant="body2" color="text.secondary" sx={{ wordBreak: 'break-all' }}>
								{status.gamePath ?? 'Not found in your Steam libraries.'}
							</Typography>
							<Button size="small" disabled={busy} onClick={() => run(() => bridgeApi!.chooseGameFolder())} sx={{ mt: 0.5, ml: -1 }}>
								{status.gamePath ? 'Change folder' : 'Choose folder'}
							</Button>
						</Step>
						<Step done={status.ue4ss} title="UE4SS (Palworld build)">
							{status.ue4ss ? (
								<Typography variant="body2" color="text.secondary">
									{status.ue4ssSource === 'workshop' ? 'Installed from the Steam Workshop.' : 'Installed manually.'}
								</Typography>
							) : status.workshopPending ? (
								<Typography variant="body2" color="text.secondary">
									Subscribed on the Workshop. Turn it on in Palworld under Options, Mod Management, then start the game once.
								</Typography>
							) : (
								<Typography variant="body2" color="text.secondary">
									Subscribe to UE4SS Experimental (Palworld) on the Steam Workshop, turn it on in Palworld under Options, Mod
									Management, then start the game once. Or unzip Okaetsu's UE4SS-Palworld.zip into Pal\Binaries\Win64.
								</Typography>
							)}
							{status.ue4ssConflict && (
								<Alert severity="warning" sx={{ mt: 1, py: 0 }}>
									Both the Workshop and a manual UE4SS are installed, which can crash the game. Delete dwmapi.dll from Pal\Binaries\Win64
									to keep only the Workshop one.
								</Alert>
							)}
							{!status.ue4ss && (
								<Box sx={{ display: 'flex', gap: 1, mt: 0.5, ml: -1 }}>
									{!status.workshopPending && (
										<Button size="small" onClick={() => bridgeApi!.openUe4ssWorkshop()}>
											Open in Steam
										</Button>
									)}
									<Button size="small" onClick={() => bridgeApi!.openUe4ssDownloads()}>
										Manual Download
									</Button>
									<Button size="small" disabled={busy} onClick={() => run(() => bridgeApi!.status())}>
										Check Again
									</Button>
								</Box>
							)}
						</Step>
						<Step done={modCurrent} title="Companion mod">
							<Typography variant="body2" color="text.secondary">
								{status.modVersion
									? modCurrent
										? `Installed, version ${status.modVersion}.`
										: `Version ${status.modVersion} installed; ${status.bundledVersion} is available.`
									: 'Not installed.'}
							</Typography>
							{!modCurrent && (
								<Button
									size="small"
									variant="contained"
									disabled={busy || !status.gamePath || !status.ue4ss}
									onClick={() => run(() => bridgeApi!.install())}
									sx={{ mt: 0.75 }}
								>
									{status.modVersion ? 'Update' : 'Install'}
								</Button>
							)}
						</Step>
						<Step done={connected} title="In game">
							<Typography variant="body2" color="text.secondary">
								{connected && coords && here
									? `Connected. You're at ${coords[0]}, ${coords[1]}${here.map === 1 ? ` on the ${MAPS[1].name}` : ''}.`
									: modCurrent
										? 'Start Palworld (restart it if it was open) and load into a world.'
										: 'Waiting for the mod.'}
							</Typography>
							{captures && (
								<Typography variant="caption" color="text.secondary">
									Catches last read {new Date(captures.at).toLocaleTimeString()}.
								</Typography>
							)}
						</Step>
					</Box>
				)}
				<FormControlLabel
					sx={{ mt: 1 }}
					control={<Switch checked={syncCatches} onChange={(e) => setSyncCatches(e.target.checked)} />}
					label="Update Paldeck Catches From the Game"
				/>
			</DialogContent>
			<DialogActions>
				<Button onClick={() => bridgeApi!.openBridgeFolder()} sx={{ mr: 'auto' }}>
					Open Data Folder
				</Button>
				<Button onClick={onClose}>Done</Button>
			</DialogActions>
		</Dialog>
	)
}

/** Title bar chip showing whether the game is linked; opens the setup dialog */
export function GameLinkChip() {
	const { connected } = useBridge()
	const [open, setOpen] = useState(false)
	return (
		<>
			<Chip
				size="small"
				variant="outlined"
				onClick={() => setOpen(true)}
				label="Game Link"
				icon={
					<Box
						component="span"
						sx={{
							width: 8,
							height: 8,
							borderRadius: '50%',
							ml: '8px !important',
							bgcolor: connected ? 'success.main' : 'text.disabled',
							boxShadow: connected ? '0 0 6px #6fcf8a' : 'none'
						}}
					/>
				}
				sx={{ borderColor: connected ? 'success.main' : undefined }}
			/>
			{open && <GameLinkDialog onClose={() => setOpen(false)} />}
		</>
	)
}
