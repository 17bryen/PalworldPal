import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('palStore', {
	load: (): Promise<string | null> => ipcRenderer.invoke('store:load'),
	save: (json: string): Promise<void> => ipcRenderer.invoke('store:save', json),
	saveNow: (json: string): void => void ipcRenderer.sendSync('store:saveNow', json)
})
