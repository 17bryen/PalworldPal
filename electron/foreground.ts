// Whether Palworld is the window in front, so the overlay can hide when you alt-tab away.
// Uses Windows' own GetForegroundWindow through koffi; if that can't load, the overlay just
// treats the game as always in front.
import { createRequire } from 'node:module'
import path from 'node:path'

const require = createRequire(import.meta.url)
const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000

type Check = () => boolean

function build(): Check {
	const koffi = require('koffi')
	const HWND = koffi.pointer('HWND', koffi.opaque())
	const user32 = koffi.load('user32.dll')
	const kernel32 = koffi.load('kernel32.dll')
	const GetForegroundWindow = user32.func('HWND __stdcall GetForegroundWindow()')
	const GetWindowThreadProcessId = user32.func('uint32_t __stdcall GetWindowThreadProcessId(HWND hWnd, _Out_ uint32_t *pid)')
	const OpenProcess = kernel32.func('void * __stdcall OpenProcess(uint32_t access, bool inherit, uint32_t pid)')
	const CloseHandle = kernel32.func('bool __stdcall CloseHandle(void *handle)')
	const QueryFullProcessImageNameW = kernel32.func(
		'bool __stdcall QueryFullProcessImageNameW(void *handle, uint32_t flags, _Out_ uint16_t *name, _Inout_ uint32_t *size)'
	)
	void HWND

	// Process ids are reused only rarely; remembering answers keeps each check to two calls
	const known = new Map<number, boolean>()
	const isPalworld = (pid: number): boolean => {
		const cached = known.get(pid)
		if (cached !== undefined) return cached
		const handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid)
		if (!handle) return false
		const name = Buffer.alloc(1040)
		const size = [520]
		const ok = QueryFullProcessImageNameW(handle, 0, name, size)
		CloseHandle(handle)
		const result = ok && /^palworld/i.test(path.basename(name.toString('utf16le', 0, size[0] * 2)))
		if (known.size > 200) known.clear()
		known.set(pid, result)
		return result
	}

	return () => {
		const window = GetForegroundWindow()
		if (!window) return false
		const pid = [0]
		GetWindowThreadProcessId(window, pid)
		return isPalworld(pid[0])
	}
}

let check: Check | null = null
export function isGameInFront(): boolean {
	try {
		check ??= build()
		return check()
	} catch (err) {
		console.warn('Foreground check unavailable; the overlay will stay up while enabled', err)
		check = () => true
		return true
	}
}
