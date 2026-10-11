import { defineConfig } from 'vite'
import electron from 'vite-plugin-electron/simple'
import react from '@vitejs/plugin-react'
import path from 'node:path'

// `vite --mode web` serves the renderer alone, without an Electron window, for browser testing
export default defineConfig(({ mode }) => ({
	// A separate dependency cache so a browser-only server can run beside the app's without the two
	// invalidating each other's optimized dependencies
	cacheDir: mode === 'web' ? 'node_modules/.vite-web' : 'node_modules/.vite',
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
	// The bundle carries the full game data and loads from disk, so its size doesn't matter
	build: { chunkSizeWarningLimit: 2000 },
	worker: { format: 'es' as const }
}))
