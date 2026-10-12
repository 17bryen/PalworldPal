// The Pal Surgery Table: which passives the player can implant instead of breeding for
import { gameData, getPassive, type PassiveInfo } from './gamedata'

export interface SurgerySettings {
	enabled: boolean
	/** Can afford the 10,000-gold passives */
	silver: boolean
	/** Can afford the 50,000-gold passives, which includes every vendor implant */
	gold: boolean
	/** Passives added beyond the table's own: vendor implants and single-use implant drops */
	extra: string[]
}

export const defaultSurgery: SurgerySettings = { enabled: false, silver: true, gold: true, extra: [] }

export const SILVER_COST = 10000

/** On the table from the start, by price */
export const TABLE_PASSIVES = gameData.passives.filter((p) => p.surgery?.kind === 'table')
const GROUP_ORDER = ['implant', 'consumable', 'worldTree']
/** Everything that has to be unlocked or found first: vendor implants, then single-use ones */
export const EXTRA_PASSIVES = gameData.passives
	.filter((p) => p.surgery && p.surgery.kind !== 'table')
	.sort((a, b) => GROUP_ORDER.indexOf(a.surgery!.kind) - GROUP_ORDER.indexOf(b.surgery!.kind) || a.name.localeCompare(b.name))

export const isSilver = (p: PassiveInfo) => !!p.surgery && p.surgery.cost > 0 && p.surgery.cost <= SILVER_COST

/** Whether the player's budget covers this passive; single-use implants cost no gold */
export function affordable(p: PassiveInfo, s: SurgerySettings): boolean {
	if (!p.surgery) return false
	if (p.surgery.cost === 0) return true
	return isSilver(p) ? s.silver : s.gold
}

/** Passives the planner can leave to the Surgery Table */
export function implantable(s: SurgerySettings | undefined): Set<string> {
	if (!s?.enabled) return new Set()
	const list = [...TABLE_PASSIVES, ...s.extra.map((n) => getPassive(n)).filter((p): p is PassiveInfo => !!p)]
	return new Set(list.filter((p) => affordable(p, s)).map((p) => p.name))
}

export const SURGERY_GROUPS: Record<Exclude<NonNullable<PassiveInfo['surgery']>['kind'], 'table'>, string> = {
	implant: 'Vendor implants',
	consumable: 'Single-use implants',
	worldTree: 'World Tree implants'
}
