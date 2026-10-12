// Stock of the merchants stationed in towns and camps, plus the Wandering Merchant that visits
// bases. Read from paldb.cc's shop pages and NPC placement (site data v1.0.5, 2026-09-15) and
// cross-checked against palworld.tools; all stock is fixed except the Black Marketeer's. Update by
// hand after content patches.
import raw from './merchants.json'

export type MerchantRole = 'goods' | 'gear' | 'pals' | 'bounty' | 'black' | 'wander'

export interface ItemOffer {
	itemId: string
	name: string
	price: number
	/** How many you get per purchase */
	quantity: number
	category: string
	/** Icon file name in public/items */
	icon: string
}

export interface PalOffer {
	palId: string
	/** The pal's base price; the merchant's price rises with level */
	price: number
	level: [number, number]
	/** Estimated buy price across the level range */
	priceAtLevel?: [number, number]
}

export type Offer = ItemOffer | PalOffer

export interface Merchant {
	id: string
	role: MerchantRole
	npc: string
	/** Portrait file name in public/npc */
	portrait: string
	currency: 'gold' | 'bounty'
	stock: Offer[]
}

export interface Town {
	id: string
	name: string
	area: string
	coords: [number, number] | null
	/** Camps that sell exactly what another town sells */
	sameStockAs?: string
	merchants: Merchant[]
}

export const towns = (raw as unknown as { towns: Town[] }).towns

export const isPalOffer = (o: Offer): o is PalOffer => 'palId' in o

/** `look` is how to spot the merchant in town, written to follow the NPC's name */
export const ROLE_INFO: Record<MerchantRole, { title: string; look: string; color: string; note?: string }> = {
	goods: { title: 'General goods', look: 'red coat', color: '#e0705a' },
	gear: { title: 'Gear', look: 'green coat', color: '#6fcf8a' },
	pals: { title: 'Pals', look: 'blue coat', color: '#5cc8f0' },
	bounty: { title: 'Bounty rewards', look: 'PIDF uniform', color: '#c8b08a' },
	black: { title: 'Black market', look: 'hooded cloak', color: '#b58cf0', note: 'Offers a few of these at a time; the selection changes daily.' },
	wander: { title: 'Roaming goods', look: 'green coat', color: '#c6d86a' }
}

export const ITEM_CATEGORIES = [...new Set(towns.flatMap((t) => t.merchants.flatMap((m) => m.stock.filter((o) => !isPalOffer(o)).map((o) => (o as ItemOffer).category))))].sort()

export const townById = new Map(towns.map((t) => [t.id, t]))
