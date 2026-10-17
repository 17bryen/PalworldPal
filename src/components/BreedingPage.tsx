import { useEffect, useState } from 'react'
import { Box, Tab, Tabs } from '@mui/material'
import { useLoaded, useStoreSelect } from '../state/store'
import type { PalFocus } from '../state/nav'
import { useBreedingRelevant, usePlan } from '../state/usePlan'
import { BreedingCalculator } from './BreedingCalculator'
import { ListsPanel } from './ListsPanel'
import { PlanPanel } from './PlanPanel'
import { XpLadder } from './XpLadder'

type View = 'calculator' | 'planner' | 'ladder'
const VIEWS: View[] = ['calculator', 'planner', 'ladder']
const VIEW_KEY = 'palbreeder.breedingView'

function initialView(): View {
	try {
		const saved = localStorage.getItem(VIEW_KEY) as View | null
		return saved && VIEWS.includes(saved) ? saved : 'calculator'
	} catch {
		return 'calculator'
	}
}

export function BreedingPage({ comboFocus }: { comboFocus: PalFocus }) {
	const allOwned = useStoreSelect((s) => s.owned)
	const wanted = useStoreSelect((s) => s.wanted)
	const settings = useStoreSelect((s) => s.settings)
	const loaded = useLoaded()
	const [view, setView] = useState<View>(initialView)
	const [selectedWanted, setSelectedWanted] = useState<string | null>(null)
	// Plans keep up with the lists from any view, so the Planner is ready when opened
	const owned = useBreedingRelevant(allOwned)
	const { plan, progress, error } = usePlan(owned, wanted, settings, loaded)

	// "Show Breeding Combinations" from another page opens the Calculator on that pal
	useEffect(() => {
		if (comboFocus) setView('calculator')
	}, [comboFocus])

	const choose = (v: View) => {
		setView(v)
		try {
			localStorage.setItem(VIEW_KEY, v)
		} catch {
			// Only a convenience
		}
	}

	return (
		<Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
			<Tabs value={view} onChange={(_, v: View) => choose(v)} sx={{ mb: 1.5, minHeight: 36, '& .MuiTab-root': { minHeight: 36, py: 0.5 } }}>
				<Tab value="calculator" label="Calculator" />
				<Tab value="planner" label="Planner" />
				<Tab value="ladder" label="XP Ladder" />
			</Tabs>
			<Box sx={{ flex: 1, minHeight: 0 }}>
				<Box sx={{ display: view === 'calculator' ? 'block' : 'none', height: '100%' }}>
					<BreedingCalculator focus={comboFocus} />
				</Box>
				<Box sx={{ display: view === 'planner' ? 'grid' : 'none', gridTemplateColumns: 'minmax(420px, 2fr) 3fr', gap: 2, height: '100%' }}>
					<ListsPanel plan={plan} selectedWanted={selectedWanted} onSelectWanted={setSelectedWanted} />
					<PlanPanel plan={plan} progress={progress} error={error} selectedWanted={selectedWanted} />
				</Box>
				<Box sx={{ display: view === 'ladder' ? 'block' : 'none', height: '100%' }}>
					{view === 'ladder' && <XpLadder />}
				</Box>
			</Box>
		</Box>
	)
}
