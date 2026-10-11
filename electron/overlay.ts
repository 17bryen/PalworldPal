// The in-game overlay: a transparent, click-through, always-on-top window over one screen that
// draws the compass and minimap. Palworld must run in borderless or windowed mode for it to show;
// exclusive fullscreen draws over every other window. In edit mode the window takes the mouse so
// the compass and minimap can be dragged into place.
import { BrowserWindow, globalShortcut, ipcMain, screen } from 'electron'
import { isGameInFront } from './foreground'

const HOTKEY = 'CommandOrControl+Shift+O'
const FOREGROUND_CHECK_MS = 300

let overlay: BrowserWindow | null = null
/** The user wants it on (app switch or hotkey) */
let wanted = false
/** Layout editing: shown regardless of the game, and takes the mouse */
let editing = false
/** Palworld is the window in front */
let gameInFront = true
/** Display id to cover, or null for the primary display */
let displayId: number | null = null

const targetBounds = () => (screen.getAllDisplays().find((d) => d.id === displayId) ?? screen.getPrimaryDisplay()).bounds

export interface DisplayInfo {
	id: number
	label: string
	primary: boolean
	width: number
	height: number
}

export function registerOverlay(options: {
	load: (win: BrowserWindow, hash: string) => void
	preload: string
	getMainWindow: () => BrowserWindow | null
}) {
	const create = () => {
		const win = new BrowserWindow({
			...targetBounds(),
			transparent: true,
			backgroundColor: '#00000000',
			frame: false,
			hasShadow: false,
			resizable: false,
			movable: false,
			skipTaskbar: true,
			focusable: false,
			alwaysOnTop: true,
			show: false,
			webPreferences: { preload: options.preload, contextIsolation: true, sandbox: false }
		})
		// Above borderless fullscreen games, and out of the mouse's way unless editing
		win.setAlwaysOnTop(true, 'screen-saver')
		win.setIgnoreMouseEvents(true)
		options.load(win, 'overlay')
		win.on('closed', () => {
			if (overlay === win) overlay = null
		})
		return win
	}

	const apply = () => {
		const visible = wanted && (editing || gameInFront)
		if (!visible) {
			overlay?.hide()
			return
		}
		if (!overlay) {
			overlay = create()
			overlay.once('ready-to-show', () => apply())
			return
		}
		overlay.setBounds(targetBounds())
		overlay.setIgnoreMouseEvents(!editing)
		overlay.setFocusable(editing)
		if (editing) {
			overlay.show()
			overlay.focus()
		} else overlay.showInactive()
	}

	const setEditing = (on: boolean) => {
		editing = on
		apply()
		for (const win of BrowserWindow.getAllWindows()) win.webContents.send('overlay:editing', on)
	}

	ipcMain.handle('overlay:set', (_e, visible: boolean, display: number | null) => {
		wanted = visible
		displayId = display
		if (!visible && editing) setEditing(false)
		else apply()
	})
	ipcMain.handle('overlay:edit', (_e, on: boolean) => {
		if (on) wanted = true
		setEditing(on)
	})
	// Layout changes made by dragging in the overlay; the app saves them
	ipcMain.handle('overlay:layout', (_e, layout: unknown) => options.getMainWindow()?.webContents.send('overlay:layout', layout))
	ipcMain.handle('overlay:displays', (): DisplayInfo[] => {
		const primary = screen.getPrimaryDisplay().id
		return screen.getAllDisplays().map((d, i) => ({
			id: d.id,
			label: d.label || `Display ${i + 1}`,
			primary: d.id === primary,
			width: d.size.width,
			height: d.size.height
		}))
	})

	const registered = globalShortcut.register(HOTKEY, () => {
		wanted = !wanted
		if (!wanted && editing) setEditing(false)
		else apply()
		// The app's switch follows the hotkey
		options.getMainWindow()?.webContents.send('overlay:toggled', wanted)
	})
	if (!registered) console.warn(`Overlay hotkey ${HOTKEY} is taken by another program`)
	ipcMain.handle('overlay:hotkey', () => (registered ? HOTKEY.replace('CommandOrControl', 'Ctrl') : null))

	// Hide when you alt-tab away from the game
	setInterval(() => {
		if (!wanted) return
		const inFront = isGameInFront()
		if (inFront !== gameInFront) {
			gameInFront = inFront
			apply()
		}
	}, FOREGROUND_CHECK_MS)
}

export function closeOverlay() {
	globalShortcut.unregisterAll()
	overlay?.destroy()
	overlay = null
}
