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

ReactDOM.createRoot(document.getElementById('root')!).render(
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
