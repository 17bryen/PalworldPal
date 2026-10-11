// Game link: reads what the PalBreeder Bridge mod writes, and installs that mod into Palworld.
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { execFile } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { appendFile, copyFile, mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'

const MOD_NAME = 'PalBreederBridge'
const UE4SS_RELEASES = 'https://github.com/Okaetsu/RE-UE4SS/releases'

const bridgeDir = () => path.join(app.getPath('userData'), 'bridge')
const configPath = () => path.join(app.getPath('userData'), 'gamelink.json')
/** The mod files shipped with the app */
const bundledModDir = () =>
	app.isPackaged ? path.join(process.resourcesPath, 'mod', MOD_NAME) : path.join(app.getAppPath(), 'mod', MOD_NAME)

export interface LiveData {
	x: number
	y: number
	z: number
	yaw: number
	mod: string
	/** When the app last saw the file change, ms since epoch */
	at: number
}

export interface CaptureData {
	counts: Record<string, number>
	mod: string
	at: number
}

/** Parses the mod's live.json; null for anything partial or malformed */
export function parseLive(text: string, at: number): LiveData | null {
	try {
		const d = JSON.parse(text)
		if (typeof d.x !== 'number' || typeof d.y !== 'number') return null
		return { x: d.x, y: d.y, z: d.z ?? 0, yaw: d.yaw ?? 0, mod: String(d.mod ?? ''), at }
	} catch {
		return null
	}
}

export function parseCaptures(text: string, at: number): CaptureData | null {
	try {
		const d = JSON.parse(text)
		if (!d.counts || typeof d.counts !== 'object') return null
		const counts: Record<string, number> = {}
		for (const [k, v] of Object.entries(d.counts)) if (typeof v === 'number') counts[k] = v
		return { counts, mod: String(d.mod ?? ''), at }
	} catch {
		return null
	}
}

let latestLive: LiveData | null = null
let latestCaptures: CaptureData | null = null

/** Polls the bridge files and forwards changes to the window. fs.watch is unreliable on Windows. */
export function startBridge(getWindow: () => BrowserWindow | null) {
	mkdirSync(bridgeDir(), { recursive: true })
	const watchFile = (name: string, everyMs: number, onChange: (text: string) => void) => {
		let last = ''
		let busy = false
		setInterval(async () => {
			if (busy) return
			busy = true
			try {
				const text = await readFile(path.join(bridgeDir(), name), 'utf8')
				if (text !== last) {
					last = text
					onChange(text)
				}
			} catch {
				// Missing between the mod's remove and rename, or the game isn't running
			} finally {
				busy = false
			}
		}, everyMs)
	}
	watchFile('live.json', 150, (text) => {
		const live = parseLive(text, Date.now())
		if (!live) return
		latestLive = live
		getWindow()?.webContents.send('bridge:live', live)
	})
	watchFile('captures.json', 1000, (text) => {
		const captures = parseCaptures(text, Date.now())
		if (!captures) return
		latestCaptures = captures
		getWindow()?.webContents.send('bridge:captures', captures)
	})
	ipcMain.handle('bridge:latest', () => ({ live: latestLive, captures: latestCaptures }))
}

// ---- Finding Palworld and installing the mod ----

async function savedGamePath(): Promise<string | null> {
	try {
		return JSON.parse(await readFile(configPath(), 'utf8')).gamePath ?? null
	} catch {
		return null
	}
}

const isGameFolder = (dir: string) => existsSync(path.join(dir, 'Pal', 'Binaries', 'Win64'))

/** Steam library folders, from the registry and libraryfolders.vdf */
async function steamLibraries(): Promise<string[]> {
	const roots = new Set<string>(['C:\\Program Files (x86)\\Steam', 'C:\\Program Files\\Steam'])
	try {
		const { stdout } = await promisify(execFile)('reg', ['query', 'HKCU\\Software\\Valve\\Steam', '/v', 'SteamPath'], { windowsHide: true })
		const match = stdout.match(/SteamPath\s+REG_SZ\s+(.+)/)
		if (match) roots.add(path.normalize(match[1].trim()))
	} catch {
		// Not installed through the usual registry key; the defaults above still apply
	}
	const libraries = new Set<string>()
	for (const root of roots) {
		libraries.add(root)
		try {
			const vdf = await readFile(path.join(root, 'steamapps', 'libraryfolders.vdf'), 'utf8')
			for (const m of vdf.matchAll(/"path"\s+"([^"]+)"/g)) libraries.add(path.normalize(m[1].replace(/\\\\/g, '\\')))
		} catch {
			// No library list here
		}
	}
	return [...libraries]
}

async function findGame(): Promise<string | null> {
	const saved = await savedGamePath()
	if (saved && isGameFolder(saved)) return saved
	for (const lib of await steamLibraries()) {
		const dir = path.join(lib, 'steamapps', 'common', 'Palworld')
		if (isGameFolder(dir)) return dir
	}
	return null
}

/** UE4SS's Mods folder: newer builds keep it under ue4ss\, older ones beside the game binary */
function modsDir(game: string): { dir: string; ue4ss: boolean } {
	const win64 = path.join(game, 'Pal', 'Binaries', 'Win64')
	const nested = path.join(win64, 'ue4ss', 'Mods')
	const flat = path.join(win64, 'Mods')
	if (existsSync(nested)) return { dir: nested, ue4ss: true }
	if (existsSync(flat) && existsSync(path.join(win64, 'UE4SS.dll'))) return { dir: flat, ue4ss: true }
	return { dir: nested, ue4ss: existsSync(path.join(win64, 'ue4ss')) || existsSync(path.join(win64, 'UE4SS.dll')) }
}

const versionOf = async (file: string) => {
	try {
		return (await readFile(file, 'utf8')).match(/local VERSION = "([^"]+)"/)?.[1] ?? null
	} catch {
		return null
	}
}

export interface GameLinkStatus {
	gamePath: string | null
	ue4ss: boolean
	modVersion: string | null
	bundledVersion: string | null
	bridgeDir: string
}

async function status(): Promise<GameLinkStatus> {
	const gamePath = await findGame()
	const bundledVersion = await versionOf(path.join(bundledModDir(), 'Scripts', 'main.lua'))
	if (!gamePath) return { gamePath, ue4ss: false, modVersion: null, bundledVersion, bridgeDir: bridgeDir() }
	const mods = modsDir(gamePath)
	return {
		gamePath,
		ue4ss: mods.ue4ss,
		modVersion: await versionOf(path.join(mods.dir, MOD_NAME, 'Scripts', 'main.lua')),
		bundledVersion,
		bridgeDir: bridgeDir()
	}
}

async function copyDir(from: string, to: string) {
	await mkdir(to, { recursive: true })
	for (const entry of await readdir(from, { withFileTypes: true })) {
		const src = path.join(from, entry.name)
		const dest = path.join(to, entry.name)
		if (entry.isDirectory()) await copyDir(src, dest)
		else await copyFile(src, dest)
	}
}

async function install(): Promise<GameLinkStatus> {
	const gamePath = await findGame()
	if (!gamePath) throw new Error('Palworld wasn\'t found. Choose its folder first.')
	const mods = modsDir(gamePath)
	if (!mods.ue4ss) throw new Error('UE4SS isn\'t installed in this Palworld folder yet.')
	await copyDir(bundledModDir(), path.join(mods.dir, MOD_NAME))
	// Older UE4SS builds only load mods listed in mods.txt; newer ones also honor enabled.txt
	const list = path.join(mods.dir, 'mods.txt')
	if (existsSync(list)) {
		const text = await readFile(list, 'utf8')
		if (!new RegExp(`^\\s*${MOD_NAME}\\s*:`, 'm').test(text)) await appendFile(list, `${text.endsWith('\n') ? '' : '\r\n'}${MOD_NAME} : 1\r\n`)
	}
	return status()
}

export function registerGameLinkHandlers(getWindow: () => BrowserWindow | null) {
	ipcMain.handle('gamelink:status', () => status())
	ipcMain.handle('gamelink:install', () => install())
	ipcMain.handle('gamelink:choose', async () => {
		const win = getWindow()
		const options = { title: 'Choose your Palworld folder', properties: ['openDirectory' as const] }
		const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
		const dir = result.filePaths[0]
		if (dir) {
			// Accept the game folder itself or anything inside it
			let game = dir
			while (!isGameFolder(game) && path.dirname(game) !== game) game = path.dirname(game)
			if (!isGameFolder(game)) throw new Error('That folder doesn\'t contain Palworld (Pal\\Binaries\\Win64).')
			await writeFile(configPath(), JSON.stringify({ gamePath: game }))
		}
		return status()
	})
	ipcMain.handle('gamelink:openUe4ss', () => shell.openExternal(UE4SS_RELEASES))
	ipcMain.handle('gamelink:openBridgeFolder', () => shell.openPath(bridgeDir()))
}
