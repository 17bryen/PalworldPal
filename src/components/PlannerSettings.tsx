import { useState } from 'react'
import {
	Autocomplete,
	Badge,
	Box,
	Button,
	Checkbox,
	Dialog,
	DialogActions,
	DialogContent,
	DialogTitle,
	Divider,
	FormControlLabel,
	IconButton,
	MenuItem,
	Switch,
	TextField,
	Tooltip,
	Typography
} from '@mui/material'
import SettingsIcon from '@mui/icons-material/SettingsOutlined'
import MapIcon from '@mui/icons-material/MapOutlined'
import PushPinIcon from '@mui/icons-material/PushPinOutlined'
import { getPassive, type PassiveInfo } from '../data/gamedata'
import { affordable, defaultSurgery, EXTRA_PASSIVES, isSilver, SURGERY_GROUPS, TABLE_PASSIVES, type SurgerySettings } from '../data/surgery'
import { MAX_GENERATIONS } from '../solver/types'
import { useStore } from '../state/store'
import { PassiveChip } from './bits'
import { MapAccessDialog } from './MapAccess'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
	return (
		<Box sx={{ mb: 2.5 }}>
			<Typography variant="overline" color="text.secondary">
				{title}
			</Typography>
			<Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1.25, mt: 0.5 }}>{children}</Box>
		</Box>
	)
}

function SurgerySection() {
	const { settings, updateSettings } = useStore()
	const surgery = settings.surgery ?? defaultSurgery
	const set = (patch: Partial<SurgerySettings>) => updateSettings({ surgery: { ...surgery, ...patch } })
	const extras = surgery.extra.map((n) => getPassive(n)).filter((p): p is PassiveInfo => !!p)
	const chip = (p: PassiveInfo, onDelete?: () => void) => (
		<Box key={p.name} sx={{ opacity: affordable(p, surgery) ? 1 : 0.35 }}>
			<PassiveChip name={p.name} onDelete={onDelete} />
		</Box>
	)
	return (
		<Section title="Pal Surgery Table">
			<Tooltip title="Target passives you can implant are added after breeding instead of bred for" placement="right">
				<FormControlLabel control={<Switch size="small" checked={surgery.enabled} onChange={(e) => set({ enabled: e.target.checked })} />} label="Implant passives" />
			</Tooltip>
			{surgery.enabled && (
				<>
					<Box sx={{ display: 'flex', gap: 2 }}>
						<FormControlLabel
							control={<Checkbox size="small" checked={surgery.silver} onChange={(e) => set({ silver: e.target.checked })} />}
							label="Silver (10,000 gold)"
						/>
						<Tooltip title="Includes every vendor implant" placement="top">
							<FormControlLabel
								control={<Checkbox size="small" checked={surgery.gold} onChange={(e) => set({ gold: e.target.checked })} />}
								label="Gold (50,000 gold)"
							/>
						</Tooltip>
					</Box>
					<Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
						{[...TABLE_PASSIVES].sort((a, b) => Number(!isSilver(a)) - Number(!isSilver(b)) || a.name.localeCompare(b.name)).map((p) => chip(p))}
						{extras.map((p) => chip(p, () => set({ extra: surgery.extra.filter((n) => n !== p.name) })))}
					</Box>
					<Autocomplete<PassiveInfo>
						size="small"
						options={EXTRA_PASSIVES.filter((p) => !surgery.extra.includes(p.name))}
						groupBy={(p) => SURGERY_GROUPS[p.surgery!.kind as keyof typeof SURGERY_GROUPS]}
						getOptionLabel={(p) => p.name}
						value={null}
						onChange={(_, p) => p && set({ extra: [...surgery.extra, p.name] })}
						autoHighlight
						blurOnSelect
						renderInput={(params) => <TextField {...params} label="Add implants you've unlocked or found" />}
						sx={{ width: '100%' }}
					/>
				</>
			)}
		</Section>
	)
}

export function PlannerSettingsButton() {
	const { settings, updateSettings } = useStore()
	const [open, setOpen] = useState(false)
	const [mapOpen, setMapOpen] = useState(false)
	const pinCount = Object.keys(settings.pins).length
	const offRegions = settings.disabledRegions.length
	return (
		<>
			<Tooltip title="Planner settings">
				<IconButton onClick={() => setOpen(true)}>
					<SettingsIcon />
				</IconButton>
			</Tooltip>
			<Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
				<DialogTitle>Planner settings</DialogTitle>
				<DialogContent dividers>
					<Section title="Breeding">
						<Box sx={{ display: 'flex', gap: 2 }}>
							<Tooltip title="Most breeding steps between a pal you have and a target pal" placement="top">
								<TextField
									select
									size="small"
									label="Max generations"
									value={settings.maxGenerations}
									onChange={(e) => updateSettings({ maxGenerations: Number(e.target.value) })}
									sx={{ width: 150 }}
								>
									{Array.from({ length: MAX_GENERATIONS }, (_, i) => i + 1).map((n) => (
										<MenuItem key={n} value={n}>
											{n}
										</MenuItem>
									))}
								</TextField>
							</Tooltip>
							<Tooltip title="Rough time to breed and hatch one egg; used to weigh eggs against catches" placement="top">
								<TextField
									size="small"
									type="number"
									label="Minutes per egg"
									value={settings.minutesPerEgg}
									onChange={(e) => updateSettings({ minutesPerEgg: Math.max(1, Number(e.target.value) || 1) })}
									sx={{ width: 150 }}
								/>
							</Tooltip>
						</Box>
						<Tooltip title="Bred pals carry no passives besides the ones you asked for, when that's possible" placement="right">
							<FormControlLabel
								control={<Switch size="small" checked={settings.onlyWantedPassives} onChange={(e) => updateSettings({ onlyWantedPassives: e.target.checked })} />}
								label="Only target passives"
							/>
						</Tooltip>
						{pinCount > 0 && (
							<Tooltip title="Pairs you chose for specific pals. Clear them to let the planner choose again." placement="right">
								<Button size="small" variant="outlined" startIcon={<PushPinIcon />} onClick={() => updateSettings({ pins: {} })}>
									Clear {pinCount} chosen
								</Button>
							</Tooltip>
						)}
					</Section>
					<Divider sx={{ mb: 2 }} />
					<Section title="Catching">
						<FormControlLabel
							control={<Switch size="small" checked={settings.allowCatching} onChange={(e) => updateSettings({ allowCatching: e.target.checked })} />}
							label="Suggest catches"
						/>
						<Tooltip title="Legendary target pals can still be caught directly" placement="right">
							<FormControlLabel
								control={
									<Switch
										size="small"
										checked={settings.allowLegendaryCatches}
										disabled={!settings.allowCatching}
										onChange={(e) => updateSettings({ allowLegendaryCatches: e.target.checked })}
									/>
								}
								label="Legendary catches"
							/>
						</Tooltip>
						<Badge color="warning" badgeContent={offRegions} invisible={!offRegions}>
							<Button size="small" variant="outlined" startIcon={<MapIcon />} onClick={() => setMapOpen(true)}>
								Map access
							</Button>
						</Badge>
					</Section>
					<Divider sx={{ mb: 2 }} />
					<SurgerySection />
				</DialogContent>
				<DialogActions>
					<Button onClick={() => setOpen(false)}>Done</Button>
				</DialogActions>
			</Dialog>
			{mapOpen && <MapAccessDialog onClose={() => setMapOpen(false)} />}
		</>
	)
}
