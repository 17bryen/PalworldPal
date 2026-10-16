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
	/** Basic materials to gather, most needed first; `have` is how many of them you already have */
	basic: { id: string; qty: number; have: number }[]
	/**
	 * Everything to craft or build, in an order where ingredients come first. `qty` is how many the
	 * list needs, `have` how many of those you already have, `crafts` the batches still to make, and
	 * `level` how many crafts deep its own ingredients go (0 when they're all basic).
	 */
	crafts: { key: string; id: string; rarity: Rarity | null; qty: number; have: number; crafts: number; makes: number; level: number }[]
}

/**
 * Everything a checklist takes. Each craftable ingredient is crafted in whole batches, totalled
 * across the list before rounding up, and broken down until only basic materials are left.
 * `basicIds` are materials to stop at even though they could be crafted. `have` counts, by
 * checklist key, what you already have: those aren't crafted again, so their ingredients drop out.
 */
export function breakdown(list: ChecklistEntry[], basicIds: Iterable<string> = DEFAULT_BASIC, have: Record<string, number> = {}): Breakdown {
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
	const ingredientsOf = new Map<string, string[]>()
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
		const owned = Math.min(need, Math.max(0, have[key] ?? 0))
		const batches = Math.ceil((need - owned) / r.makes)
		if (need > 0) {
			crafts.push({ key, id: r.id, rarity: r.rarity, qty: need, have: owned, crafts: batches, makes: r.makes, level: 0 })
			ingredientsOf.set(key, r.tier.materials.map((m) => m.id))
		}
		for (const m of r.tier.materials) {
			demand.set(m.id, (demand.get(m.id) ?? 0) + batches * m.qty)
			const left = (consumers.get(m.id) ?? 1) - 1
			consumers.set(m.id, left)
			if (left <= 0) queue.push(m.id)
		}
	}
	// A step sits one level past the deepest step among its ingredients
	const levels = new Map<string, number>()
	const levelOf = (key: string, seen = new Set<string>()): number => {
		const known = levels.get(key)
		if (known != null) return known
		seen.add(key)
		let level = 0
		for (const m of ingredientsOf.get(key) ?? []) {
			if (ingredientsOf.has(m) && !seen.has(m)) level = Math.max(level, levelOf(m, seen) + 1)
		}
		levels.set(key, level)
		return level
	}
	for (const c of crafts) c.level = levelOf(c.key)
	const order = new Map(crafts.map((c, i) => [c.key, -i]))
	// Each step follows the chain of its last prerequisite, so an indented step sits under what it needs
	const chains = new Map<string, number>()
	for (const c of [...crafts].filter((c) => c.level === 0).sort((a, b) => order.get(a.key)! - order.get(b.key)!)) chains.set(c.key, chains.size)
	const chainOf = (key: string): number => {
		const known = chains.get(key)
		if (known != null) return known
		chains.set(key, 0)
		const chain = Math.max(0, ...(ingredientsOf.get(key) ?? []).filter((m) => ingredientsOf.has(m)).map(chainOf))
		chains.set(key, chain)
		return chain
	}
	return {
		basic: [...basic]
			.map(([id, qty]) => ({ id, qty, have: Math.min(qty, Math.max(0, have[id] ?? 0)) }))
			.sort((a, b) => b.qty - a.qty || materialName(a.id).localeCompare(materialName(b.id))),
		// Ingredients first, the things on the list last
		crafts: crafts.sort((a, b) => chainOf(a.key) - chainOf(b.key) || a.level - b.level || order.get(a.key)! - order.get(b.key)!)
	}
}
