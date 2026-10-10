import { solvePlan } from './solver'
import type { OwnedPal, PlanSettings, WantedPal } from './types'

export interface SolveRequest {
	id: number
	owned: OwnedPal[]
	wanted: WantedPal[]
	settings: PlanSettings
}

self.onmessage = (e: MessageEvent<SolveRequest>) => {
	const { id, owned, wanted, settings } = e.data
	try {
		const plan = solvePlan(owned, wanted, settings, (progress) => self.postMessage({ id, type: 'progress', progress }))
		self.postMessage({ id, type: 'done', plan })
	} catch (err) {
		self.postMessage({ id, type: 'error', message: err instanceof Error ? err.message : String(err) })
	}
}
