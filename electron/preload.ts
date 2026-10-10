import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('palStore', {
	load: (): Promise<string | null> => ipcRenderer.invoke('store:load'),
	save: (json: string): Promise<void> => ipcRenderer.invoke('store:save', json),
	onChanged: (cb: (json: string) => void) => {
		const listener = (_e: unknown, json: string) => cb(json)
		ipcRenderer.on('store:changed', listener)
		return () => ipcRenderer.removeListener('store:changed', listener)
	},
	saveNow: (json: string): void => void ipcRenderer.sendSync('store:saveNow', json)
})

contextBridge.exposeInMainWorld('palBridge', {
	latest: () => ipcRenderer.invoke('bridge:latest'),
	onLive: (cb: (data: unknown) => void) => {
		const listener = (_e: unknown, data: unknown) => cb(data)
		ipcRenderer.on('bridge:live', listener)
		return () => ipcRenderer.removeListener('bridge:live', listener)
	},
	onCaptures: (cb: (data: unknown) => void) => {
		const listener = (_e: unknown, data: unknown) => cb(data)
		ipcRenderer.on('bridge:captures', listener)
		return () => ipcRenderer.removeListener('bridge:captures', listener)
	},
	onPals: (cb: (data: unknown) => void) => {
		const listener = (_e: unknown, data: unknown) => cb(data)
		ipcRenderer.on('bridge:pals', listener)
		return () => ipcRenderer.removeListener('bridge:pals', listener)
	},
	onWild: (cb: (data: unknown) => void) => {
		const listener = (_e: unknown, data: unknown) => cb(data)
		ipcRenderer.on('bridge:wild', listener)
		return () => ipcRenderer.removeListener('bridge:wild', listener)
	},
	status: () => ipcRenderer.invoke('gamelink:status'),
	install: () => ipcRenderer.invoke('gamelink:install'),
	chooseGameFolder: () => ipcRenderer.invoke('gamelink:choose'),
	openUe4ssDownloads: () => ipcRenderer.invoke('gamelink:openUe4ss'),
	openUe4ssWorkshop: () => ipcRenderer.invoke('gamelink:openWorkshop'),
	openBridgeFolder: () => ipcRenderer.invoke('gamelink:openBridgeFolder')
})

const listen = (channel: string) => (cb: (data: any) => void) => {
	const listener = (_e: unknown, data: unknown) => cb(data)
	ipcRenderer.on(channel, listener)
	return () => ipcRenderer.removeListener(channel, listener)
}

contextBridge.exposeInMainWorld('palOverlay', {
	set: (visible: boolean, display: number | null): Promise<void> => ipcRenderer.invoke('overlay:set', visible, display),
	edit: (on: boolean): Promise<void> => ipcRenderer.invoke('overlay:edit', on),
	sendLayout: (layout: unknown): Promise<void> => ipcRenderer.invoke('overlay:layout', layout),
	displays: () => ipcRenderer.invoke('overlay:displays'),
	onEditing: listen('overlay:editing'),
	onLayout: listen('overlay:layout'),
	hotkey: (): Promise<string | null> => ipcRenderer.invoke('overlay:hotkey'),
	onToggled: (cb: (visible: boolean) => void) => {
		const listener = (_e: unknown, visible: boolean) => cb(visible)
		ipcRenderer.on('overlay:toggled', listener)
		return () => ipcRenderer.removeListener('overlay:toggled', listener)
	}
})
