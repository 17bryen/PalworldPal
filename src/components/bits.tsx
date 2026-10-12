import { Avatar, Box, Chip, Tooltip } from '@mui/material'
import MaleIcon from '@mui/icons-material/Male'
import FemaleIcon from '@mui/icons-material/Female'
import ImplantIcon from '@mui/icons-material/MedicalServicesOutlined'
import { getPal, getPassive, type Gender, type WorkKind } from '../data/gamedata'
import { rarityColor } from '../theme'

const asset = (file: string) => `${import.meta.env.BASE_URL}${file}`

export function PalAvatar({ palId, size = 32 }: { palId: string; size?: number }) {
	const pal = getPal(palId)
	const color = rarityColor(pal.rarity)
	return (
		<Avatar
			src={asset(`pals/${pal.id}.png`)}
			alt={pal.name}
			sx={{
				width: size,
				height: size,
				fontSize: size * 0.4,
				fontWeight: 700,
				bgcolor: `${color}1f`,
				color,
				border: `1.5px solid ${color}99`
			}}
		>
			{pal.name.slice(0, 2)}
		</Avatar>
	)
}

export function WorkIcon({ kind, size = 20 }: { kind: WorkKind; size?: number }) {
	return <img src={asset(`work/${kind}.png`)} alt={WORK_INFO[kind].label} width={size} height={size} style={{ display: 'block' }} />
}

export function GenderIcon({ gender, size = 18 }: { gender: Gender | null; size?: number }) {
	if (!gender) return null
	return gender === 'M' ? (
		<MaleIcon sx={{ fontSize: size, color: '#6fb3f0' }} titleAccess="Male" />
	) : (
		<FemaleIcon sx={{ fontSize: size, color: '#f08ac0' }} titleAccess="Female" />
	)
}

export function passiveColor(rank: number): string {
	if (rank >= 4) return '#f0c35c'
	if (rank >= 3) return '#b58cf0'
	if (rank >= 1) return '#6fcf8a'
	return '#f07a7a'
}

export function PassiveChip({ name, onDelete, implant }: { name: string; onDelete?: (event: React.SyntheticEvent) => void; implant?: boolean }) {
	const info = getPassive(name)
	const color = passiveColor(info?.rank ?? 0)
	const description = info?.description || name
	return (
		<Tooltip title={implant ? `Implant at the Pal Surgery Table. ${description}` : description}>
			<Chip
				size="small"
				label={name}
				onDelete={onDelete}
				icon={implant ? <ImplantIcon /> : undefined}
				variant="outlined"
				sx={{ color, borderColor: `${color}66`, '& .MuiChip-deleteIcon': { color: `${color}aa` }, '& .MuiChip-icon': { color, fontSize: 14 } }}
			/>
		</Tooltip>
	)
}

/** `implants` show after the bred passives, marked as Surgery Table implants */
export function PassiveList({ passives, other = 0, implants = [] }: { passives: string[]; other?: number; implants?: string[] }) {
	if (!passives.length && !other && !implants.length) return null
	return (
		<Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
			{passives.map((p) => (
				<PassiveChip key={p} name={p} />
			))}
			{implants.map((p) => (
				<PassiveChip key={`implant:${p}`} name={p} implant />
			))}
			{other > 0 && (
				<Tooltip title="Passives you didn't ask for. Bred pals show the most they could carry.">
					<Chip size="small" label={`+${other} Other`} variant="outlined" sx={{ color: 'text.secondary' }} />
				</Tooltip>
			)}
		</Box>
	)
}

export const WORK_INFO: Record<WorkKind, { label: string; color: string }> = {
	kindling: { label: 'Kindling', color: '#f08a5c' },
	watering: { label: 'Watering', color: '#5c9cf0' },
	planting: { label: 'Planting', color: '#6fcf8a' },
	electricity: { label: 'Generating Electricity', color: '#f0d45c' },
	handiwork: { label: 'Handiwork', color: '#c9b08a' },
	gathering: { label: 'Gathering', color: '#9ccf6f' },
	lumbering: { label: 'Lumbering', color: '#b0875c' },
	mining: { label: 'Mining', color: '#a6b4c8' },
	medicine: { label: 'Medicine Production', color: '#f08ac0' },
	cooling: { label: 'Cooling', color: '#8adcf0' },
	transporting: { label: 'Transporting', color: '#c8a6f0' },
	farming: { label: 'Farming', color: '#f0e0b0' }
}
