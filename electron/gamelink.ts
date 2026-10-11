// Game link: reads what the PalBreeder Bridge mod writes, and installs that mod into Palworld.
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { execFile } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { appendFile, copyFile, mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'

const MOD_NAME = 'PalBreederBridge'
const UE4SS_RELEASES = 'https://github.com/Okaetsu/RE-UE4SS/releases'
/** Steam Workshop item "UE4SS Experimental (Palworld)" and Palworld's Steam app id */
const UE4SS_WORKSHOP_ID = '3625223587'
const PALWORLD_APP_ID = '1623730'

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
	/** A menu, inventory, chest or the map is open (the game is showing its cursor) */
	ui: boolean
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
		return { x: d.x, y: d.y, z: d.z ?? 0, yaw: d.yaw ?? 0, ui: d.ui === true, mod: String(d.mod ?? ''), at }
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

/** Polls the bridge files and forwards changes to every window (app and overlay). fs.watch is unreliable on Windows. */
export function startBridge() {
	const send = (channel: string, data: unknown) => {
		for (const win of BrowserWindow.getAllWindows()) win.webContents.send(channel, data)
	}
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
	// The mod writes about 10 times a second; reading often keeps the delay under a frame or two
	watchFile('live.json', 50, (text) => {
		const live = parseLive(text, Date.now())
		if (!live) return
		latestLive = live
		send('bridge:live', live)
	})
	watchFile('captures.json', 1000, (text) => {
		const captures = parseCaptures(text, Date.now())
		if (!captures) return
		latestCaptures = captures
		send('bridge:captures', captures)
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

/** Whether the UE4SS Workshop item is downloaded in any Steam library */
async function workshopSubscribed(): Promise<boolean> {
	for (const lib of await steamLibraries()) {
		if (existsSync(path.join(lib, 'steamapps', 'workshop', 'content', PALWORLD_APP_ID, UE4SS_WORKSHOP_ID))) return true
	}
	return false
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

type Ue4ssSource = 'workshop' | 'manual'

/**
 * Where UE4SS lives. The Steam Workshop build (turned on in Palworld's Mod Management) loads Lua
 * mods from Mods\NativeMods\UE4SS\Mods under the game folder. A manual install keeps them in
 * Pal\Binaries\Win64\ue4ss\Mods, or Win64\Mods on older builds.
 */
function findUe4ss(game: string): { workshop: string | null; manual: string | null } {
	const workshopRoot = path.join(game, 'Mods', 'NativeMods', 'UE4SS')
	const win64 = path.join(game, 'Pal', 'Binaries', 'Win64')
	const nested = path.join(win64, 'ue4ss', 'Mods')
	const flat = path.join(win64, 'Mods')
	const manual = existsSync(path.join(win64, 'dwmapi.dll')) || existsSync(path.join(win64, 'ue4ss')) || existsSync(path.join(win64, 'UE4SS.dll'))
	return {
		workshop: existsSync(workshopRoot) ? path.join(workshopRoot, 'Mods') : null,
		manual: manual ? (existsSync(nested) || !existsSync(flat) ? nested : flat) : null
	}
}

/** The Mods folder to install into, preferring the Workshop build when it's set up */
function modsDir(game: string): { dir: string; source: Ue4ssSource } | null {
	const found = findUe4ss(game)
	if (found.workshop) return { dir: found.workshop, source: 'workshop' }
	if (found.manual) return { dir: found.manual, source: 'manual' }
	return null
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
	ue4ssSource: Ue4ssSource | null
	/** The Workshop UE4SS is downloaded but hasn't been turned on in Mod Management yet */
	workshopPending: boolean
	/** Both a Workshop and a manual UE4SS are present, which can crash the game */
	ue4ssConflict: boolean
	modVersion: string | null
	bundledVersion: string | null
	bridgeDir: string
}

async function status(): Promise<GameLinkStatus> {
	const gamePath = await findGame()
	const base = {
		bundledVersion: await versionOf(path.join(bundledModDir(), 'Scripts', 'main.lua')),
		bridgeDir: bridgeDir()
	}
	const subscribed = await workshopSubscribed()
	if (!gamePath) {
		return { ...base, gamePath, ue4ss: false, ue4ssSource: null, workshopPending: subscribed, ue4ssConflict: false, modVersion: null }
	}
	const found = findUe4ss(gamePath)
	const mods = modsDir(gamePath)
	return {
		...base,
		gamePath,
		ue4ss: !!mods,
		ue4ssSource: mods?.source ?? null,
		workshopPending: subscribed && !found.workshop,
		ue4ssConflict: !!found.workshop && !!found.manual,
		modVersion: mods ? await versionOf(path.join(mods.dir, MOD_NAME, 'Scripts', 'main.lua')) : null
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
	if (!mods) throw new Error('UE4SS isn\'t set up in this Palworld folder yet.')
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
	// Opens the item in the Steam client, where subscribing is one click
	ipcMain.handle('gamelink:openWorkshop', () => shell.openExternal(`steam://url/CommunityFilePage/${UE4SS_WORKSHOP_ID}`))
	ipcMain.handle('gamelink:openBridgeFolder', () => shell.openPath(bridgeDir()))
}
