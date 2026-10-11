import { app, BrowserWindow, ipcMain } from 'electron'
import { fileURLToPath } from 'node:url'
import { readFile, writeFile, rename } from 'node:fs/promises'
import { renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
const storePath = () => path.join(app.getPath('userData'), 'palbreeder.json')

ipcMain.handle('store:load', async () => {
	try {
		return await readFile(storePath(), 'utf8')
	} catch {
		return null
	}
})

ipcMain.handle('store:save', async (_event, json: string) => {
	// Write then rename so a crash mid-save never leaves a half-written file
	const tmp = `${storePath()}.tmp`
	await writeFile(tmp, json, 'utf8')
	await rename(tmp, storePath())
})

// Blocking save for when the window closes, so an edit made just before closing isn't lost
ipcMain.on('store:saveNow', (event, json: string) => {
	try {
		const tmp = `${storePath()}.tmp`
		writeFileSync(tmp, json, 'utf8')
		renameSync(tmp, storePath())
	} finally {
		event.returnValue = null
	}
})

function createWindow() {
	const win = new BrowserWindow({
		width: 1440,
		height: 900,
		minWidth: 1100,
		minHeight: 700,
		title: 'PalBreeder',
		backgroundColor: '#14161c',
		autoHideMenuBar: true,
		// The app's own top bar is the title bar; Windows draws its window buttons over the right end
		titleBarStyle: 'hidden',
		titleBarOverlay: { color: '#14161c', symbolColor: '#c8ccd6', height: 48 },
		webPreferences: {
			preload: path.join(__dirname, 'preload.cjs'),
			contextIsolation: true,
			sandbox: false
		}
	})
	if (DEV_SERVER_URL) win.loadURL(DEV_SERVER_URL)
	else win.loadFile(path.join(__dirname, '../dist/index.html'))
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
	if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
	if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
