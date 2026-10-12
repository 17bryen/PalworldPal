import { useMemo } from 'react'
import { Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, List, ListItemButton, Typography } from '@mui/material'
import { pals } from '../data/gamedata'
import { OTHER_REGION, REGIONS, spawnRegions } from '../data/regions'
import { useStore } from '../state/store'

export function MapAccessDialog({ onClose }: { onClose: () => void }) {
	const { settings, updateSettings } = useStore()
	const off = new Set(settings.disabledRegions)

	const counts = useMemo(() => {
		const c = new Map<string, number>()
		for (const p of pals) for (const r of spawnRegions(p.id)) c.set(r, (c.get(r) ?? 0) + 1)
		return c
	}, [])

	const toggle = (key: string) => {
		const next = new Set(off)
		if (next.has(key)) next.delete(key)
		else next.add(key)
		updateSettings({ disabledRegions: [...next] })
	}

	const row = (key: string, name: string, detail: string) => (
		<ListItemButton key={key} onClick={() => toggle(key)} sx={{ gap: 1.5 }}>
			<Checkbox size="small" checked={!off.has(key)} tabIndex={-1} sx={{ p: 0.25 }} />
			<Typography variant="body2" fontWeight={600} sx={{ flex: 1 }}>
				{name}
			</Typography>
			<Typography variant="caption" color="text.secondary">
				{detail}
			</Typography>
		</ListItemButton>
	)

	return (
		<Dialog open onClose={onClose} maxWidth="xs" fullWidth>
			<DialogTitle>Map Access</DialogTitle>
			<DialogContent dividers sx={{ p: 0 }}>
				<Typography variant="body2" color="text.secondary" sx={{ px: 2, py: 1.5 }}>
					Plans only suggest catching pals that spawn in a region you have checked.
				</Typography>
				<List dense disablePadding>
					{REGIONS.map((r) => row(r.key, r.name, `Lv ${r.wildLevel[0]}-${r.wildLevel[1]}, ${counts.get(r.key) ?? 0} pals`))}
					<Box sx={{ borderTop: 1, borderColor: 'divider' }}>
						{row(OTHER_REGION.key, OTHER_REGION.name, `Dungeons, events, unmapped; ${counts.get(OTHER_REGION.key) ?? 0} pals`)}
					</Box>
				</List>
			</DialogContent>
			<DialogActions>
				{off.size > 0 && <Button onClick={() => updateSettings({ disabledRegions: [] })}>Turn All On</Button>}
				<Button onClick={onClose}>Done</Button>
			</DialogActions>
		</Dialog>
	)
}
