import { useState } from 'react'
import { Box, Tab, Tabs } from '@mui/material'
import { useStore } from '../state/store'
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

export function BreedingPage() {
	const store = useStore()
	const [view, setView] = useState<View>(initialView)
	const [selectedWanted, setSelectedWanted] = useState<string | null>(null)
	// Plans keep up with the lists from any view, so the Planner is ready when opened
	const owned = useBreedingRelevant(store.owned)
	const { plan, progress, error } = usePlan(owned, store.wanted, store.settings, store.loaded)

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
					<BreedingCalculator />
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
