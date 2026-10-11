import { createContext, useContext } from 'react'

/** Jumps between pages, e.g. from a Paldeck row to that pal on the map */
export interface Navigation {
	openPalOnMap: (palId: string) => void
}

export const NavigationContext = createContext<Navigation>({ openPalOnMap: () => {} })

export const useNavigation = () => useContext(NavigationContext)
