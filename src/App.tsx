import { useRef, useState } from 'react'
import { AppBar, Box, IconButton, Menu, MenuItem, Snackbar, Tab, Tabs, Toolbar, Tooltip, Typography } from '@mui/material'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import EggIcon from '@mui/icons-material/Egg'
import { gameData } from './data/gamedata'
import { sanitize, useStore } from './state/store'
import { usePlan } from './state/usePlan'
import { ListsPanel } from './components/ListsPanel'
import { PlanPanel } from './components/PlanPanel'
import { PalsPage } from './components/PalsPage'
import { AlternativesProvider } from './components/Alternatives'

function DataMenu() {
	const store = useStore()
	const [anchor, setAnchor] = useState<HTMLElement | null>(null)
	const [message, setMessage] = useState<string | null>(null)
	const fileInput = useRef<HTMLInputElement>(null)

	const exportLists = () => {
		setAnchor(null)
		const blob = new Blob([JSON.stringify(store.state, null, 2)], { type: 'application/json' })
		const a = document.createElement('a')
		a.href = URL.createObjectURL(blob)
		a.download = 'palbreeder-lists.json'
		a.click()
		URL.revokeObjectURL(a.href)
	}

	const importLists = async (file: File) => {
		try {
			store.replaceState(sanitize(JSON.parse(await file.text())))
			setMessage('Lists imported.')
		} catch {
			setMessage('That file isn\'t a PalBreeder export.')
		}
	}

	return (
		<>
			<Tooltip title="Data">
				<IconButton onClick={(e) => setAnchor(e.currentTarget)}>
					<MoreVertIcon />
				</IconButton>
			</Tooltip>
			<Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}>
				<MenuItem onClick={exportLists}>Export lists...</MenuItem>
				<MenuItem
					onClick={() => {
						setAnchor(null)
						fileInput.current?.click()
					}}
				>
					Import lists...
				</MenuItem>
				<MenuItem disabled>
					<Typography variant="caption">Game data: {gameData.source}</Typography>
				</MenuItem>
			</Menu>
			<input
				ref={fileInput}
				type="file"
				accept="application/json,.json"
				hidden
				onChange={(e) => {
					const file = e.target.files?.[0]
					if (file) void importLists(file)
					e.target.value = ''
				}}
			/>
			<Snackbar open={!!message} autoHideDuration={3000} onClose={() => setMessage(null)} message={message} />
		</>
	)
}

export function App() {
	const store = useStore()
	const [page, setPage] = useState<'breeding' | 'pals'>('breeding')
	// The Pals page mounts on first visit and then stays mounted, so switching back is instant
	const [palsMounted, setPalsMounted] = useState(false)
	const [selectedWanted, setSelectedWanted] = useState<string | null>(null)
	const { plan, progress, error } = usePlan(store.owned, store.wanted, store.settings, store.loaded)

	return (
		<AlternativesProvider>
			<Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', bgcolor: 'background.default' }}>
				<AppBar position="static" color="transparent" elevation={0} sx={{ borderBottom: 1, borderColor: 'divider' }}>
					<Toolbar variant="dense" sx={{ gap: 2 }}>
						<Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
							<EggIcon color="primary" />
							<Typography variant="h6">PalBreeder</Typography>
						</Box>
						<Tabs
							value={page}
							onChange={(_, v) => {
								setPage(v)
								if (v === 'pals') setPalsMounted(true)
							}}
						>
							<Tab value="breeding" label="Breeding" />
							<Tab value="pals" label="Pals" />
						</Tabs>
						<Box sx={{ ml: 'auto' }}>
							<DataMenu />
						</Box>
					</Toolbar>
				</AppBar>
				<Box sx={{ flex: 1, minHeight: 0, p: 2 }}>
					{/* Both pages stay mounted so switching tabs doesn't rebuild the 300-row table */}
					<Box sx={{ display: page === 'breeding' ? 'grid' : 'none', gridTemplateColumns: 'minmax(420px, 2fr) 3fr', gap: 2, height: '100%' }}>
						<ListsPanel plan={plan} selectedWanted={selectedWanted} onSelectWanted={setSelectedWanted} />
						<PlanPanel plan={plan} progress={progress} error={error} selectedWanted={selectedWanted} />
					</Box>
					<Box sx={{ display: page === 'pals' ? 'block' : 'none', height: '100%' }}>
						{palsMounted && <PalsPage />}
					</Box>
				</Box>
			</Box>
		</AlternativesProvider>
	)
}
