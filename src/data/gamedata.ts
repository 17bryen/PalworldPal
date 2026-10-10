import raw from './gamedata.json'

export type Gender = 'M' | 'F'

export const WORK_KINDS = [
	'kindling',
	'watering',
	'planting',
	'electricity',
	'handiwork',
	'gathering',
	'lumbering',
	'mining',
	'medicine',
	'cooling',
	'transporting',
	'farming'
] as const
export type WorkKind = (typeof WORK_KINDS)[number]

export interface PalInfo {
	id: string
	name: string
	dex: number
	variant: boolean
	rarity: number
	legendary: boolean
	wild: boolean
	minWildLevel: number | null
	maxWildLevel: number | null
	catchMinutes: number
	maleChance: number
	work: Record<WorkKind, number>
}

export interface PassiveInfo {
	name: string
	rank: number
	description: string
	/** Can roll on wild pals, so Yakumo's partner skill can copy it */
	copyable: boolean
}

export const YAKUMO_ID = 'GuardianDog'
/** Yakumo's chance per passive to copy onto a captured pal, by condensation stars 0-4 */
export const YAKUMO_CHANCE = [0.15, 0.18, 0.21, 0.24, 0.3]

export interface GenderRule {
	a: number
	aGender: Gender
	b: number
	bGender: Gender
	child: number
}

export interface GameData {
	source: string
	builtAt: string
	pals: PalInfo[]
	passives: PassiveInfo[]
	passiveInheritanceWeights: Record<number, number>
	passiveRandomWeights: Record<number, number>
	/** Flat pals x pals matrix of child indices; -1 means the result depends on the parents' genders */
	children: number[]
	genderRules: GenderRule[]
}

export const gameData = raw as unknown as GameData
export const pals = gameData.pals
export const palCount = pals.length

const palIndexById = new Map(pals.map((p, i) => [p.id, i]))
const palById = new Map(pals.map((p) => [p.id, p]))
const passiveByName = new Map(gameData.passives.map((p) => [p.name, p]))

export function palIndex(id: string): number {
	const i = palIndexById.get(id)
	if (i == null) throw new Error(`Unknown pal ${id}`)
	return i
}

export function getPal(id: string): PalInfo {
	const p = palById.get(id)
	if (!p) throw new Error(`Unknown pal ${id}`)
	return p
}

export function getPassive(name: string): PassiveInfo | undefined {
	return passiveByName.get(name)
}

/** Child of a pairing, or -1 when no child results for those genders */
export function breedChild(a: number, aGender: Gender, b: number, bGender: Gender): number {
	const c = gameData.children[a * palCount + b]
	if (c >= 0) return c
	const rule = gameData.genderRules.find(
		(r) =>
			(r.a === a && r.aGender === aGender && r.b === b && r.bGender === bGender) ||
			(r.a === b && r.aGender === bGender && r.b === a && r.bGender === aGender)
	)
	return rule ? rule.child : -1
}
