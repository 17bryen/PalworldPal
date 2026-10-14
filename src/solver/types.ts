import type { Gender } from '../data/gamedata'
import type { SurgerySettings } from '../data/surgery'
import type { PalStats } from '../data/expeditions'

export type { Gender }

export interface OwnedPal {
	uid: string
	palId: string
	gender: Gender
	/** In slot order; Yakumo copies them in this order */
	passives: string[]
	/** Condensation stars, 0-4; only used for Yakumo */
	stars?: number
	/** Key of the game pal it came from or was matched to (GamePal.key) */
	game?: string
	/** Last stats and storage the game reported, kept so expedition estimates work between sessions */
	stats?: PalStats
	box?: 'party' | 'palbox'
	/** Where the game last showed it, for "Last Seen" when it isn't loaded this session */
	seen?: { box: 'party' | 'palbox'; slot: number }
}

export interface WantedPal {
	uid: string
	palId: string
	passives: string[]
	/** Left out of the steps and catch list, but still planned so shared steps favor it */
	disabled?: boolean
}

export type CatchPref = 'easy' | 'hard' | 'never'

/** A chosen way to get one pal, keyed by pinKey(palId, passives) */
export type Pin = { kind: 'pair'; a: string; b: string } | { kind: 'catch' }

export interface PlanSettings {
	maxGenerations: number
	allowCatching: boolean
	allowLegendaryCatches: boolean
	/** When a wanted pal has target passives, the result may not carry any others */
	onlyWantedPassives: boolean
	minutesPerEgg: number
	catchPrefs: Record<string, CatchPref>
	/** Map regions the player can't reach yet; their spawns aren't suggested as catches */
	disabledRegions: string[]
	pins: Record<string, Pin>
	/** Passives to implant at the Pal Surgery Table instead of breeding for */
	surgery?: SurgerySettings
}

export const MAX_GENERATIONS = 5

export function pinKey(palId: string, passives: string[]): string {
	return `${palId}|${[...passives].sort().join(',')}`
}

export type NodeSource =
	| { kind: 'owned'; ownedUid: string }
	| { kind: 'catch'; minutes: number; yakumo?: { ownedUid: string; catches: number } }
	| { kind: 'bred'; eggs: number; stepId?: number }

export interface PlanNode {
	/** Same key, same pal: shared nodes appear once in the steps */
	key: string
	palId: string
	/** Set when this exact gender is needed (or is the owned pal's gender) */
	gender: Gender | null
	/** Wanted passives it carries */
	passives: string[]
	source: NodeSource
	parents?: [PlanNode, PlanNode]
	/** Both parents are bred, so keep breeding one until their genders differ */
	matchGenders?: boolean
}

export interface PlanStep {
	id: number
	node: PlanNode
	/** Enabled wanted pals whose trees include this step */
	forWanted: string[]
}

export type TargetStatus = 'have' | 'planned' | 'unreachable'

export interface TargetResult {
	wantedUid: string
	palId: string
	disabled: boolean
	status: TargetStatus
	tree?: PlanNode
	missingPassives: string[]
	/** Wanted passives to implant at the Surgery Table once the pal is bred */
	implants: string[]
	reason?: string
	minutes: number
	generations: number
}

export interface CatchItem {
	key: string
	palId: string
	gender: Gender | null
	passives: string[]
	minutes: number
	yakumo?: { ownedUid: string; catches: number }
	forWanted: string[]
}

export interface Plan {
	targets: TargetResult[]
	steps: PlanStep[]
	catches: CatchItem[]
	totalMinutes: number
	totalEggs: number
}

export interface SolveProgress {
	done: number
	total: number
	label: string
}
