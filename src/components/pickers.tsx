import { useMemo } from 'react'
import { Autocomplete, Box, TextField, Typography } from '@mui/material'
import { gameData, getPal, pals, type PalInfo, type PassiveInfo } from '../data/gamedata'
import { PalAvatar, PassiveChip, passiveColor } from './bits'

const palOptions = [...pals].sort((a, b) => a.name.localeCompare(b.name))

export function PalPicker({
	value,
	onChange,
	label = 'Pal',
	autoFocus,
	inputRef
}: {
	value: string | null
	onChange: (palId: string | null) => void
	label?: string
	autoFocus?: boolean
	inputRef?: React.Ref<HTMLInputElement>
}) {
	return (
		<Autocomplete<PalInfo>
			size="small"
			options={palOptions}
			value={value ? getPal(value) : null}
			onChange={(_, p) => onChange(p?.id ?? null)}
			getOptionLabel={(p) => p.name}
			isOptionEqualToValue={(a, b) => a.id === b.id}
			autoHighlight
			renderOption={({ key, ...props }, p) => (
				<Box component="li" key={key} {...props} sx={{ display: 'flex', gap: 1.25, alignItems: 'center' }}>
					<PalAvatar palId={p.id} size={24} />
					<Typography variant="body2" sx={{ flex: 1 }}>
						{p.name}
					</Typography>
					<Typography variant="caption" color="text.secondary">
						#{p.dex}
					</Typography>
				</Box>
			)}
			renderInput={(params) => <TextField {...params} label={label} autoFocus={autoFocus} inputRef={inputRef} />}
			sx={{ minWidth: 200 }}
		/>
	)
}

export function PassivePicker({
	value,
	onChange,
	label = 'Passives'
}: {
	value: string[]
	onChange: (passives: string[]) => void
	label?: string
}) {
	// A new array on every render would clear whatever is being typed, so it only changes with `value`
	const selected = useMemo(
		() => value.map((name) => gameData.passives.find((p) => p.name === name) ?? { name, ids: [], rank: 0, description: '', copyable: false }),
		[value]
	)
	return (
		<Autocomplete<PassiveInfo, true>
			multiple
			size="small"
			options={gameData.passives}
			value={selected}
			onChange={(_, list) => onChange(list.map((p) => p.name))}
			getOptionLabel={(p) => p.name}
			isOptionEqualToValue={(a, b) => a.name === b.name}
			getOptionDisabled={() => value.length >= 4}
			disableCloseOnSelect
			autoHighlight
			renderTags={(list, getTagProps) =>
				list.map((p, index) => {
					const { key, onDelete } = getTagProps({ index })
					return <PassiveChip key={key} name={p.name} onDelete={onDelete} />
				})
			}
			renderOption={({ key, ...props }, p) => (
				<Box component="li" key={key} {...props} sx={{ display: 'flex', gap: 1, alignItems: 'baseline' }}>
					<Typography variant="body2" sx={{ color: passiveColor(p.rank), minWidth: 150 }}>
						{p.name}
					</Typography>
					<Typography variant="caption" color="text.secondary" noWrap>
						{p.description}
					</Typography>
				</Box>
			)}
			renderInput={(params) => <TextField {...params} label={label} placeholder={value.length ? '' : 'Up to 4'} />}
			sx={{ flex: 1, minWidth: 220 }}
		/>
	)
}
