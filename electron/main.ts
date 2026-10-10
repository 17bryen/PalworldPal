import { app, BrowserWindow, ipcMain } from 'electron'
import { fileURLToPath } from 'node:url'
import { readFile, writeFile, rename } from 'node:fs/promises'
import { renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { registerGameLinkHandlers, startBridge } from './gamelink'
import { closeOverlay, registerOverlay } from './overlay'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
// The app was renamed from PalBreeder. Its data, and the companion mod's files, stay in the original
// folder, which Electron would otherwise move to one named after the product.
// PALWORLDPAL_USER_DATA points a test run elsewhere, so it can't touch real lists.
app.setPath('userData', process.env.PALWORLDPAL_USER_DATA || path.join(app.getPath('appData'), 'palbreeder'))
const storePath = () => path.join(app.getPath('userData'), 'palbreeder.json')
/** Window and taskbar icon; the packaged .exe also embeds it */
const appIcon = path.join(__dirname, app.isPackaged ? '../dist/icon.png' : '../public/icon.png')

ipcMain.handle('store:load', async () => {
	try {
		return await readFile(storePath(), 'utf8')
	} catch {
		return null
	}
})

/** Lets the overlay window follow settings changed in the main window */
function broadcastStore(from: Electron.WebContents, json: string) {
	for (const win of BrowserWindow.getAllWindows()) if (win.webContents !== from) win.webContents.send('store:changed', json)
}

ipcMain.handle('store:save', async (event, json: string) => {
	// Write then rename so a crash mid-save never leaves a half-written file
	const tmp = `${storePath()}.tmp`
	await writeFile(tmp, json, 'utf8')
	await rename(tmp, storePath())
	broadcastStore(event.sender, json)
})

// Blocking save for when the window closes, so an edit made just before closing isn't lost
ipcMain.on('store:saveNow', (event, json: string) => {
	try {
		const tmp = `${storePath()}.tmp`
		writeFileSync(tmp, json, 'utf8')
		renameSync(tmp, storePath())
		broadcastStore(event.sender, json)
	} finally {
		event.returnValue = null
	}
})

let mainWindow: BrowserWindow | null = null
const getWindow = () => mainWindow
const preload = path.join(__dirname, 'preload.cjs')

/** Loads the renderer; the hash picks the page (empty for the app, "overlay" for the overlay) */
function loadPage(win: BrowserWindow, hash = '') {
	if (DEV_SERVER_URL) win.loadURL(hash ? `${DEV_SERVER_URL}#${hash}` : DEV_SERVER_URL)
	else win.loadFile(path.join(__dirname, '../dist/index.html'), hash ? { hash } : undefined)
}

function createWindow() {
	const win = new BrowserWindow({
		width: 1440,
		height: 900,
		minWidth: 1100,
		minHeight: 700,
		title: 'PalworldPal',
		icon: appIcon,
		backgroundColor: '#14161c',
		autoHideMenuBar: true,
		// The app's own top bar is the title bar; Windows draws its window buttons over the right end
		titleBarStyle: 'hidden',
		titleBarOverlay: { color: '#14161c', symbolColor: '#c8ccd6', height: 48 },
		webPreferences: {
			preload,
			contextIsolation: true,
			sandbox: false
		}
	})
	loadPage(win)
	mainWindow = win
	win.on('closed', () => {
		if (mainWindow === win) mainWindow = null
		// The overlay has no way to close itself; it goes with the app
		closeOverlay()
	})
}

app.whenReady().then(() => {
	registerGameLinkHandlers(getWindow)
	startBridge()
	registerOverlay({ load: loadPage, preload, getMainWindow: getWindow })
	createWindow()
})

app.on('will-quit', () => closeOverlay())

app.on('window-all-closed', () => {
	if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
	if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
