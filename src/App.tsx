import { useMemo, useRef, useState } from 'react'
import {
	AppBar,
	Box,
	Button,
	Dialog,
	DialogActions,
	DialogContent,
	DialogTitle,
	Divider,
	IconButton,
	ListItemIcon,
	ListSubheader,
	Menu,
	MenuItem,
	Snackbar,
	Tab,
	Tabs,
	TextField,
	Toolbar,
	Tooltip,
	Typography
} from '@mui/material'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import CheckIcon from '@mui/icons-material/Check'
import EggIcon from '@mui/icons-material/Egg'
import { gameData } from './data/gamedata'
import { sanitize, useStore, worldLabel } from './state/store'
import { BreedingPage } from './components/BreedingPage'
import { PaldeckPage } from './components/PaldeckPage'
import { MerchantsPage } from './components/MerchantsPage'
import { ExpeditionsPage } from './components/ExpeditionsPage'
import { RecipesPage } from './components/RecipesPage'
import { MapPage } from './components/MapPage'
import { NavigationContext } from './state/nav'
import { GameLinkChip } from './components/GameLink'
import { OverlayPage, useOverlaySync } from './components/OverlaySettings'
import { useLootTracker } from './state/loot'
import { AlternativesProvider } from './components/Alternatives'

function DataMenu() {
	const store = useStore()
	const [anchor, setAnchor] = useState<HTMLElement | null>(null)
	const [message, setMessage] = useState<string | null>(null)
	const [renaming, setRenaming] = useState<string | null>(null)
	const fileInput = useRef<HTMLInputElement>(null)
	// Each save or server the game link has seen keeps its own lists
	const worldIds = store.world ? [store.world, ...Object.keys(store.worlds).filter((id) => id !== store.world)] : []

	const exportLists = () => {
		setAnchor(null)
		const blob = new Blob([JSON.stringify(store.snapshot(), null, 2)], { type: 'application/json' })
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
				{worldIds.length > 0 && <ListSubheader sx={{ lineHeight: '32px', bgcolor: 'transparent' }}>Worlds</ListSubheader>}
				{worldIds.map((id) => (
					<MenuItem
						key={id}
						onClick={() => {
							setAnchor(null)
							store.switchWorld(id)
						}}
					>
						<ListItemIcon>{id === store.world && <CheckIcon fontSize="small" />}</ListItemIcon>
						{worldLabel(id, store.worldNames)}
					</MenuItem>
				))}
				{store.world && (
					<MenuItem
						onClick={() => {
							setAnchor(null)
							setRenaming(worldLabel(store.world!, store.worldNames))
						}}
					>
						<ListItemIcon />
						Rename This World...
					</MenuItem>
				)}
				{worldIds.length > 0 && <Divider />}
				<MenuItem onClick={exportLists}>Export Lists...</MenuItem>
				<MenuItem
					onClick={() => {
						setAnchor(null)
						fileInput.current?.click()
					}}
				>
					Import Lists...
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
			<Dialog open={renaming != null} onClose={() => setRenaming(null)} maxWidth="xs" fullWidth>
				<DialogTitle>Rename This World</DialogTitle>
				<DialogContent>
					<TextField
						autoFocus
						fullWidth
						size="small"
						value={renaming ?? ''}
						onChange={(e) => setRenaming(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === 'Enter' && renaming?.trim() && store.world) {
								store.renameWorld(store.world, renaming)
								setRenaming(null)
							}
						}}
						slotProps={{ htmlInput: { maxLength: 40 } }}
						sx={{ mt: 1 }}
					/>
				</DialogContent>
				<DialogActions>
					<Button onClick={() => setRenaming(null)}>Cancel</Button>
					<Button
						variant="contained"
						disabled={!renaming?.trim()}
						onClick={() => {
							if (store.world && renaming) store.renameWorld(store.world, renaming)
							setRenaming(null)
						}}
					>
						Save
					</Button>
				</DialogActions>
			</Dialog>
		</>
	)
}

type Page = 'paldeck' | 'map' | 'breeding' | 'merchants' | 'expeditions' | 'recipes' | 'overlay'
const PAGES: Page[] = ['paldeck', 'map', 'breeding', 'merchants', 'expeditions', 'recipes', 'overlay']
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

/** Overlay sync and loot timers; a component of their own so their updates don't redraw the pages */
function BackgroundTasks() {
	useOverlaySync()
	useLootTracker()
	return null
}

export function App() {
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

	return (
		<NavigationContext.Provider value={navigation}>
			<AlternativesProvider>
				<BackgroundTasks />
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
								<Tab value="expeditions" label="Expeditions" />
								<Tab value="recipes" label="Recipes" />
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
						<Box sx={{ display: page === 'breeding' ? 'block' : 'none', height: '100%' }}>
							<BreedingPage />
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
						<Box sx={{ display: page === 'expeditions' ? 'block' : 'none', height: '100%' }}>
							{visited.has('expeditions') && <ExpeditionsPage />}
						</Box>
						<Box sx={{ display: page === 'recipes' ? 'block' : 'none', height: '100%' }}>
							{visited.has('recipes') && <RecipesPage />}
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
