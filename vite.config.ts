import { defineConfig } from 'vite'
import electron from 'vite-plugin-electron/simple'
import react from '@vitejs/plugin-react'
import path from 'node:path'

// `vite --mode web` serves the renderer alone, without an Electron window, for browser testing.
// `vite build --mode package` builds into pkg/ for electron-builder, so packaging never rewrites
// the dist/ and dist-electron/ files a running `npm run dev` app is using.
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
						main: {
							entry: 'electron/main.ts',
							vite: {
								build: {
									outDir: mode === 'package' ? 'pkg/dist-electron' : 'dist-electron',
									// koffi ships native binaries, so it's loaded from node_modules at runtime
									rollupOptions: { external: ['koffi'] }
								}
							}
						},
						preload: {
							input: path.join(__dirname, 'electron/preload.ts'),
							vite: {
								build: {
									outDir: mode === 'package' ? 'pkg/dist-electron' : 'dist-electron',
									// The plugin emits CommonJS; a .cjs name keeps Electron from loading it as an ES module
									rollupOptions: { output: { format: 'cjs', entryFileNames: '[name].cjs' } }
								}
							}
						}
					})
				])
	],
	// Packaging output isn't source; watching it reloads a running dev app hundreds of times
	server: { port: 5188, watch: { ignored: ['**/release/**', '**/pkg/**'] } },
	// The bundle carries the full game data and loads from disk, so its size doesn't matter
	build: { chunkSizeWarningLimit: 2000, outDir: mode === 'package' ? 'pkg/dist' : 'dist' },
	worker: { format: 'es' as const }
}))
