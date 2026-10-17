import { useEffect, useRef, useState } from 'react'
import type { OwnedPal, Plan, PlanSettings, SolveProgress, WantedPal } from '../solver/types'
import type { SolveRequest } from '../solver/worker'

type WorkerMessage =
	| { id: number; type: 'progress'; progress: SolveProgress }
	| { id: number; type: 'done'; plan: Plan }
	| { id: number; type: 'error'; message: string }

/**
 * My Pals as far as breeding cares: the same array until a pal is added or removed or its species,
 * gender, passives or Yakumo stars change. Levels and stats syncing from the game don't re-plan.
 */
export function useBreedingRelevant(owned: OwnedPal[]): OwnedPal[] {
	const last = useRef<{ signature: string; owned: OwnedPal[] } | null>(null)
	const signature = JSON.stringify(owned.map((o) => [o.uid, o.palId, o.gender, o.passives, o.stars ?? null]))
	if (!last.current || last.current.signature !== signature) last.current = { signature, owned }
	return last.current.owned
}

/** Re-plans in a background worker whenever the lists or settings change */
export function usePlan(owned: OwnedPal[], wanted: WantedPal[], settings: PlanSettings, enabled: boolean) {
	const [plan, setPlan] = useState<Plan | null>(null)
	const [progress, setProgress] = useState<SolveProgress | null>(null)
	const [error, setError] = useState<string | null>(null)
	const worker = useRef<Worker | null>(null)
	const busy = useRef(false)
	const lastId = useRef(0)

	useEffect(() => () => worker.current?.terminate(), [])

	useEffect(() => {
		if (!enabled) return
		const timer = setTimeout(() => {
			// A newer request replaces one still running; restarting the worker is the only way to stop it
			if (busy.current) {
				worker.current?.terminate()
				worker.current = null
			}
			if (!worker.current) {
				worker.current = new Worker(new URL('../solver/worker.ts', import.meta.url), { type: 'module' })
				worker.current.onmessage = (e: MessageEvent<WorkerMessage>) => {
					const msg = e.data
					if (msg.id !== lastId.current) return
					if (msg.type === 'progress') setProgress(msg.progress)
					else {
						busy.current = false
						setProgress(null)
						if (msg.type === 'done') {
							setPlan(msg.plan)
							setError(null)
						} else setError(msg.message)
					}
				}
			}
			const id = ++lastId.current
			busy.current = true
			setProgress({ done: 0, total: wanted.length * 2, label: 'Starting' })
			const request: SolveRequest = { id, owned, wanted, settings }
			worker.current.postMessage(request)
		}, 300)
		return () => clearTimeout(timer)
	}, [owned, wanted, settings, enabled])

	return { plan, progress, error }
}
