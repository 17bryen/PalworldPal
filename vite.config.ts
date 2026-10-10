import { defineConfig } from 'vite'
import electron from 'vite-plugin-electron/simple'
import react from '@vitejs/plugin-react'
import path from 'node:path'

// `vite --mode web` serves the renderer alone, without an Electron window, for browser testing
export default defineConfig(({ mode }) => ({
	// Relative asset paths so icons resolve when Electron loads the built files from disk
	base: './',
	plugins: [
		react(),
		...(mode === 'web'
			? []
			: [
					electron({
						main: { entry: 'electron/main.ts' },
						preload: {
							input: path.join(__dirname, 'electron/preload.ts'),
							// The plugin emits CommonJS; a .cjs name keeps Electron from loading it as an ES module
							vite: { build: { rollupOptions: { output: { format: 'cjs', entryFileNames: '[name].cjs' } } } }
						}
					})
				])
	],
	server: { port: 5188 },
	worker: { format: 'es' as const }
}))
