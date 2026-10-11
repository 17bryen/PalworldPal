import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('palStore', {
	load: (): Promise<string | null> => ipcRenderer.invoke('store:load'),
	save: (json: string): Promise<void> => ipcRenderer.invoke('store:save', json),
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
	status: () => ipcRenderer.invoke('gamelink:status'),
	install: () => ipcRenderer.invoke('gamelink:install'),
	chooseGameFolder: () => ipcRenderer.invoke('gamelink:choose'),
	openUe4ssDownloads: () => ipcRenderer.invoke('gamelink:openUe4ss'),
	openUe4ssWorkshop: () => ipcRenderer.invoke('gamelink:openWorkshop'),
	openBridgeFolder: () => ipcRenderer.invoke('gamelink:openBridgeFolder')
})
