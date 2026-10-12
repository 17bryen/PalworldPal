import { useMemo, useRef, useState } from 'react'
import { AppBar, Box, IconButton, Menu, MenuItem, Snackbar, Tab, Tabs, Toolbar, Tooltip, Typography } from '@mui/material'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import EggIcon from '@mui/icons-material/Egg'
import { gameData } from './data/gamedata'
import { sanitize, useStore } from './state/store'
import { usePlan } from './state/usePlan'
import { ListsPanel } from './components/ListsPanel'
import { PlanPanel } from './components/PlanPanel'
import { PaldeckPage } from './components/PaldeckPage'
import { MerchantsPage } from './components/MerchantsPage'
import { MapPage } from './components/MapPage'
import { NavigationContext } from './state/nav'
import { GameLinkChip } from './components/GameLink'
import { OverlayPage, useOverlaySync } from './components/OverlaySettings'
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
		a.download = 'palworldpal-lists.json'
		a.click()
		URL.revokeObjectURL(a.href)
	}

	const importLists = async (file: File) => {
		try {
			store.replaceState(sanitize(JSON.parse(await file.text())))
			setMessage('Lists imported.')
		} catch {
			setMessage('That file isn\'t a PalworldPal export.')
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

type Page = 'paldeck' | 'map' | 'breeding' | 'merchants' | 'overlay'
const PAGES: Page[] = ['paldeck', 'map', 'breeding', 'merchants', 'overlay']
const PAGE_KEY = 'palbreeder.page'

/** The tab the app reopens on: the last one used, or the first */
function initialPage(): Page {
	try {
		const saved = localStorage.getItem(PAGE_KEY) as Page | null
		return saved && PAGES.includes(saved) ? saved : PAGES[0]
	} catch {
		return PAGES[0]
	}
}

export function App() {
	const store = useStore()
	const [page, setPage] = useState<Page>(initialPage)
	// Pages mount on first visit and then stay mounted, so switching back is instant
	const [visited, setVisited] = useState<Set<Page>>(() => new Set([page]))
	const [mapFocus, setMapFocus] = useState<{ palId: string; nonce: number } | null>(null)

	const goTo = (v: Page) => {
		setPage(v)
		setVisited((s) => (s.has(v) ? s : new Set([...s, v])))
		try {
			localStorage.setItem(PAGE_KEY, v)
		} catch {
			// Only a convenience; the app still opens fine on the first tab
		}
	}
	const navigation = useMemo(
		() => ({
			openPalOnMap: (palId: string) => {
				setMapFocus((f) => ({ palId, nonce: (f?.nonce ?? 0) + 1 }))
				goTo('map')
			}
		}),
		[]
	)
	const [selectedWanted, setSelectedWanted] = useState<string | null>(null)
	const { plan, progress, error } = usePlan(store.owned, store.wanted, store.settings, store.loaded)
	useOverlaySync()

	return (
		<NavigationContext.Provider value={navigation}>
			<AlternativesProvider>
				<Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', bgcolor: 'background.default' }}>
					<AppBar
						position="static"
						color="transparent"
						elevation={0}
						sx={{
							borderBottom: 1,
							borderColor: 'divider',
							// Doubles as the window's title bar: drag to move, double-click to maximize
							'-webkit-app-region': 'drag',
							// Everything clickable opts out, including MUI chips, which render as div role=button
							'& button, & input, & [role=tab], & [role=button]': { '-webkit-app-region': 'no-drag' },
							// Keep clear of the window buttons Windows draws at the right end (zero in a browser)
							pr: 'calc(100vw - env(titlebar-area-x, 0px) - env(titlebar-area-width, 100vw))'
						}}
					>
						<Toolbar variant="dense" sx={{ gap: 2, minHeight: 48 }}>
							<Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
								<EggIcon color="primary" />
								<Typography variant="h6">PalworldPal</Typography>
							</Box>
							<Tabs
								value={page}
								onChange={(_, v: Page) => goTo(v)}
							>
								<Tab value="paldeck" label="Paldeck" />
								<Tab value="map" label="Map" />
								<Tab value="breeding" label="Breeding" />
								<Tab value="merchants" label="Merchants" />
								<Tab value="overlay" label="Overlay" />
							</Tabs>
							<Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 1 }}>
								<GameLinkChip />
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
						<Box sx={{ display: page === 'paldeck' ? 'block' : 'none', height: '100%' }}>
							{visited.has('paldeck') && <PaldeckPage />}
						</Box>
						<Box sx={{ display: page === 'map' ? 'block' : 'none', height: '100%' }}>
							{visited.has('map') && <MapPage focus={mapFocus} visible={page === 'map'} />}
						</Box>
						<Box sx={{ display: page === 'merchants' ? 'block' : 'none', height: '100%' }}>
							{visited.has('merchants') && <MerchantsPage />}
						</Box>
						<Box sx={{ display: page === 'overlay' ? 'block' : 'none', height: '100%' }}>
							{visited.has('overlay') && <OverlayPage />}
						</Box>
					</Box>
				</Box>
			</AlternativesProvider>
		</NavigationContext.Provider>
	)
}
