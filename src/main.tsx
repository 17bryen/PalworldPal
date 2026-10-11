import React from 'react'
import ReactDOM from 'react-dom/client'
import { CssBaseline, ThemeProvider } from '@mui/material'
import '@fontsource/roboto/400.css'
import '@fontsource/roboto/500.css'
import '@fontsource/roboto/600.css'
import '@fontsource/roboto/700.css'
import { theme } from './theme'
import { StoreProvider } from './state/store'
import { BridgeProvider } from './state/bridge'
import { App } from './App'
import { OverlayApp } from './components/Overlay'

const root = ReactDOM.createRoot(document.getElementById('root')!)

if (location.hash === '#overlay') {
	// The overlay window: a see-through layer over the game that only reads the app's settings
	document.documentElement.style.background = 'transparent'
	document.body.style.background = 'transparent'
	document.body.style.margin = '0'
	document.body.style.overflow = 'hidden'
	root.render(
		<React.StrictMode>
			<ThemeProvider theme={theme}>
				<StoreProvider readOnly>
					<BridgeProvider syncCatches={false}>
						<OverlayApp />
					</BridgeProvider>
				</StoreProvider>
			</ThemeProvider>
		</React.StrictMode>
	)
} else {
	root.render(
		<React.StrictMode>
			<ThemeProvider theme={theme}>
				<CssBaseline />
				<StoreProvider>
					<BridgeProvider>
						<App />
					</BridgeProvider>
				</StoreProvider>
			</ThemeProvider>
		</React.StrictMode>
	)
}
