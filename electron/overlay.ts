// The in-game overlay: a transparent, click-through, always-on-top window over the whole screen
// that draws the compass and minimap. Palworld must run in borderless or windowed mode for it to
// show; exclusive fullscreen draws over every other window.
import { BrowserWindow, globalShortcut, ipcMain, screen } from 'electron'

const HOTKEY = 'CommandOrControl+Shift+O'

let overlay: BrowserWindow | null = null
let wanted = false

function create(load: (win: BrowserWindow, hash: string) => void, preload: string): BrowserWindow {
	const { bounds } = screen.getPrimaryDisplay()
	const win = new BrowserWindow({
		...bounds,
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
		webPreferences: { preload, contextIsolation: true, sandbox: false }
	})
	// Above borderless fullscreen games, and never in the way of the mouse
	win.setAlwaysOnTop(true, 'screen-saver')
	win.setIgnoreMouseEvents(true)
	load(win, 'overlay')
	win.on('closed', () => {
		if (overlay === win) overlay = null
	})
	return win
}

export function registerOverlay(options: {
	load: (win: BrowserWindow, hash: string) => void
	preload: string
	getMainWindow: () => BrowserWindow | null
}) {
	const apply = () => {
		if (wanted) {
			if (!overlay) {
				overlay = create(options.load, options.preload)
				overlay.once('ready-to-show', () => wanted && overlay?.showInactive())
			} else overlay.showInactive()
		} else overlay?.hide()
	}

	ipcMain.handle('overlay:set', (_e, visible: boolean) => {
		wanted = visible
		apply()
	})

	const registered = globalShortcut.register(HOTKEY, () => {
		wanted = !wanted
		apply()
		// The app's switch follows the hotkey
		options.getMainWindow()?.webContents.send('overlay:toggled', wanted)
	})
	if (!registered) console.warn(`Overlay hotkey ${HOTKEY} is taken by another program`)
	ipcMain.handle('overlay:hotkey', () => (registered ? HOTKEY.replace('CommandOrControl', 'Ctrl') : null))
}

export function closeOverlay() {
	globalShortcut.unregisterAll()
	overlay?.destroy()
	overlay = null
}
