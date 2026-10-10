import { createTheme } from '@mui/material/styles'

export const theme = createTheme({
	palette: {
		mode: 'dark',
		primary: { main: '#5cc8f0' },
		secondary: { main: '#f0a85c' },
		success: { main: '#6fcf8a' },
		warning: { main: '#f0c35c' },
		error: { main: '#f07a7a' },
		background: { default: '#14161c', paper: '#1b1e26' },
		divider: 'rgba(255,255,255,0.08)'
	},
	shape: { borderRadius: 10 },
	typography: {
		fontFamily: 'Roboto, system-ui, sans-serif',
		h6: { fontWeight: 600 },
		subtitle2: { fontWeight: 600 }
	},
	components: {
		MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
		MuiButton: { defaultProps: { disableElevation: true }, styleOverrides: { root: { textTransform: 'none' } } },
		MuiTab: { styleOverrides: { root: { textTransform: 'none', minHeight: 44 } } },
		MuiTabs: { styleOverrides: { root: { minHeight: 44 } } },
		MuiChip: { styleOverrides: { root: { fontWeight: 500 } } },
		MuiTooltip: { defaultProps: { enterDelay: 400 } },
		MuiTableCell: { styleOverrides: { root: { borderColor: 'rgba(255,255,255,0.06)' } } }
	}
})

/** Rarity tiers as the game colors them: common, rare, epic, legendary */
export function rarityColor(rarity: number): string {
	if (rarity >= 20) return '#f0c35c'
	if (rarity >= 8) return '#b58cf0'
	if (rarity >= 5) return '#5cc8f0'
	return '#8a93a6'
}
