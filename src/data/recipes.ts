// Crafting recipes and structure build costs, built by `npm run recipes` from paldb.cc, and the
// math that turns a checklist into the basic materials it takes.
import raw from './recipes.json'

export type RecipeGroup = 'Spheres' | 'Weapon' | 'Armor' | 'Tool' | 'Consumable' | 'Material' | 'Structure'
export type Rarity = 'Common' | 'Uncommon' | 'Rare' | 'Epic' | 'Legendary'

export interface Ingredient {
	id: string
	qty: number
}

export interface Tier {
	/** Blueprint quality; null for things without tiers */
	rarity: Rarity | null
	materials: Ingredient[]
}

export interface Recipe {
	id: string
	name: string
	group: RecipeGroup
	/** Build menu category, for structures */
	category?: string
	/** Icon file name: public/build for structures, public/items for everything else */
	icon: string | null
	tech: number | null
	description: string
	/** The plain recipe first, then higher blueprint tiers */
	tiers: Tier[]
	/** How many one craft makes, when it's more than one */
	makes?: number
	stations?: string[]
	alternatives?: { makes: number; materials: Ingredient[] }[]
}

const data = raw as unknown as { source: string; items: Recipe[]; materials: Record<string, { name: string; icon: string | null }> }
export const recipes = data.items
export const RECIPE_SOURCE = data.source
const byId = new Map(recipes.filter((r) => r.group !== 'Structure').map((r) => [r.id, r]))
const anyById = new Map(recipes.map((r) => [r.id, r]))

/** The crafting bench's tabs, then the build menu categories */
export const ITEM_GROUPS: RecipeGroup[] = ['Spheres', 'Weapon', 'Armor', 'Tool', 'Consumable', 'Material']
export const STRUCTURE_CATEGORIES = ['Production', 'Pal', 'Storage', 'Food', 'Infrastructure']
export const RARITIES: Rarity[] = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary']
export const RARITY_COLOR: Record<Rarity, string> = { Common: '#c8ccd6', Uncommon: '#6fcf8a', Rare: '#5cc8f0', Epic: '#b58cf0', Legendary: '#f0c35c' }

export const getRecipe = (id: string) => anyById.get(id)
export const materialName = (id: string) => data.materials[id]?.name ?? anyById.get(id)?.name ?? id.replace(/_/g, ' ')
/** Path under public/ for a recipe's or material's icon */
export function iconPath(id: string): string | null {
	const r = anyById.get(id)
	if (r?.icon) return r.group === 'Structure' ? `build/${r.icon}.webp` : `items/${r.icon}.webp`
	const icon = data.materials[id]?.icon
	return icon ? `items/${icon}.webp` : null
}

/**
 * Craftable materials that are usually gathered or bought instead: Paldium is mined, Fiber comes
 * off trees, coins and souls are earned (and souls convert into each other)
 */
export const DEFAULT_BASIC = ['Paldium_Fragment', 'Fiber', 'Gold_Coin', 'Small_Pal_Soul', 'Medium_Pal_Soul', 'Large_Pal_Soul']

export interface ChecklistEntry {
	key: string
	id: string
	/** Blueprint tier, for gear that has them */
	rarity: Rarity | null
	qty: number
}

export const entryKey = (id: string, rarity: Rarity | null) => (rarity ? `${id}@${rarity}` : id)

export function tierOf(r: Recipe, rarity: Rarity | null): Tier {
	return r.tiers.find((t) => t.rarity === rarity) ?? r.tiers[0]
}

export interface Breakdown {
	/** Basic materials to gather, most needed first */
	basic: { id: string; qty: number }[]
	/** Everything to craft or build, in an order where ingredients come first */
	crafts: { key: string; id: string; rarity: Rarity | null; qty: number; crafts: number; makes: number }[]
}

/**
 * Everything a checklist takes. Each craftable ingredient is crafted in whole batches, totalled
 * across the list before rounding up, and broken down until only basic materials are left.
 * `basicIds` are materials to stop at even though they could be crafted.
 */
export function breakdown(list: ChecklistEntry[], basicIds: Iterable<string> = DEFAULT_BASIC): Breakdown {
	const basicSet = new Set(basicIds)
	// Nodes: checklist entries (gear at a tier) and every craftable ingredient under them
	const recipeOf = (key: string): { id: string; rarity: Rarity | null; tier: Tier; makes: number } | null => {
		const [id, rarity] = key.split('@') as [string, Rarity | undefined]
		const r = rarity || list.some((e) => e.key === key) ? anyById.get(id) : byId.get(id)
		if (!r || (basicSet.has(id) && !list.some((e) => e.key === key))) return null
		return { id, rarity: rarity ?? null, tier: tierOf(r, rarity ?? null), makes: r.makes ?? 1 }
	}

	// Walk the graph once to find each node's consumers; a loop makes the looping material basic
	const consumers = new Map<string, number>()
	const state = new Map<string, 'open' | 'done'>()
	const cyclic = new Set<string>()
	const visit = (key: string) => {
		if (state.get(key) === 'done') return
		if (state.get(key) === 'open') {
			cyclic.add(key)
			return
		}
		state.set(key, 'open')
		const r = recipeOf(key)
		if (r) {
			for (const m of r.tier.materials) {
				consumers.set(m.id, (consumers.get(m.id) ?? 0) + 1)
				visit(m.id)
			}
		}
		state.set(key, 'done')
	}
	for (const e of list) visit(e.key)

	// Then hand demand down from consumers to ingredients, each node once all its consumers are done
	const demand = new Map<string, number>()
	for (const e of list) demand.set(e.key, (demand.get(e.key) ?? 0) + e.qty)
	const queue = [...new Set(list.map((e) => e.key))].filter((k) => !consumers.get(k))
	const basic = new Map<string, number>()
	const crafts: Breakdown['crafts'] = []
	const done = new Set<string>()
	while (queue.length) {
		const key = queue.shift()!
		if (done.has(key)) continue
		done.add(key)
		const need = demand.get(key) ?? 0
		const r = cyclic.has(key) ? null : recipeOf(key)
		if (!r) {
			if (need > 0) basic.set(key, (basic.get(key) ?? 0) + need)
			continue
		}
		const batches = Math.ceil(need / r.makes)
		if (need > 0) crafts.push({ key, id: r.id, rarity: r.rarity, qty: need, crafts: batches, makes: r.makes })
		for (const m of r.tier.materials) {
			demand.set(m.id, (demand.get(m.id) ?? 0) + batches * m.qty)
			const left = (consumers.get(m.id) ?? 1) - 1
			consumers.set(m.id, left)
			if (left <= 0) queue.push(m.id)
		}
	}
	return {
		basic: [...basic].map(([id, qty]) => ({ id, qty })).sort((a, b) => b.qty - a.qty || materialName(a.id).localeCompare(materialName(b.id))),
		// Ingredients first, the things on the list last
		crafts: crafts.reverse()
	}
}
