import type { Gender } from '../data/gamedata'

export type { Gender }

export interface OwnedPal {
	uid: string
	palId: string
	gender: Gender
	passives: string[]
}

export interface WantedPal {
	uid: string
	palId: string
	passives: string[]
}

export type CatchPref = 'easy' | 'hard' | 'never'

export interface PlanSettings {
	maxGenerations: number
	allowCatching: boolean
	allowLegendaryCatches: boolean
	/** When a wanted pal has target passives, the result may not carry any others */
	onlyWantedPassives: boolean
	minutesPerEgg: number
	catchPrefs: Record<string, CatchPref>
}

export const MAX_GENERATIONS = 5

/** Where a parent in a breeding step comes from */
export type ParentSource =
	| { kind: 'owned'; ownedUid: string }
	| { kind: 'catch'; minutes: number }
	| { kind: 'step'; stepId: number }

export interface PalRef {
	palId: string
	/** null when either gender works */
	gender: Gender | null
	/** Wanted passives it carries */
	passives: string[]
	/** Count of passives that aren't wanted (an upper bound for bred pals) */
	otherPassives: number
	source: ParentSource
}

export interface PlanNode extends PalRef {
	/** Present when this pal is bred in this step of the plan */
	breed?: { stepId: number; eggs: number; parents: [PlanNode, PlanNode] }
}

export interface PlanStep {
	id: number
	child: PalRef
	parents: [PalRef, PalRef]
	eggs: number
	/** Wanted list entry this step was first planned for */
	forWanted: string
}

export type TargetStatus = 'have' | 'planned' | 'unreachable'

export interface TargetResult {
	wantedUid: string
	palId: string
	status: TargetStatus
	tree?: PlanNode
	missingPassives: string[]
	reason?: string
	minutes: number
	generations: number
}

export interface CatchItem {
	palId: string
	male: number
	female: number
	minutes: number
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
