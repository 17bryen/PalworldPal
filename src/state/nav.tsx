import { createContext, useContext } from 'react'

/** Jumps between pages, e.g. from a Paldeck row to that pal on the map */
export interface Navigation {
	openPalOnMap: (palId: string) => void
	/** The Breeding Calculator's By Child view for this pal */
	openPalCombos: (palId: string) => void
}

/** A pal another page asked to show, with a counter so asking twice for the same pal still works */
export type PalFocus = { palId: string; nonce: number } | null

export const NavigationContext = createContext<Navigation>({ openPalOnMap: () => {}, openPalCombos: () => {} })

export const useNavigation = () => useContext(NavigationContext)
