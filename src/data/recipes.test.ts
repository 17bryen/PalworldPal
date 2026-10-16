import { describe, expect, it } from 'vitest'
import { breakdown, entryKey, getRecipe, recipes, type ChecklistEntry } from './recipes'

const entry = (id: string, qty: number, rarity: ChecklistEntry['rarity'] = null): ChecklistEntry => ({ key: entryKey(id, rarity), id, rarity, qty })
const basicOf = (b: ReturnType<typeof breakdown>) => Object.fromEntries(b.basic.map((m) => [m.id, m.qty]))

describe('recipe data', () => {
	it('has items in every bench tab and the five structure categories', () => {
		for (const g of ['Spheres', 'Weapon', 'Armor', 'Tool', 'Consumable', 'Material']) expect(recipes.some((r) => r.group === g)).toBe(true)
		for (const c of ['Production', 'Pal', 'Storage', 'Food', 'Infrastructure']) expect(recipes.some((r) => r.category === c)).toBe(true)
		expect(getRecipe('Pal_Metal_Armor')!.tiers.map((t) => t.rarity)).toEqual(['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'])
		expect(getRecipe('Nail')!.makes).toBe(5)
	})
})

describe('breakdown', () => {
	it('breaks crafted materials down to what you gather', () => {
		// 10 Nails: 2 crafts of 5, each 1 Ingot of 2 Ore
		const b = breakdown([entry('Nail', 10)])
		expect(basicOf(b)).toEqual({ Ore: 4 })
		expect(b.crafts.map((c) => [c.id, c.crafts])).toEqual([
			['Ingot', 2],
			['Nail', 2]
		])
	})

	it('totals shared ingredients across the list before rounding up batches', () => {
		// 3 Nails + 3 Nails = 6 Nails = 2 crafts, not 1 + 1 rounded separately... and not 2 + 2
		const b = breakdown([entry('Nail', 3), entry('Wooden_Board', 3)])
		const nails = b.crafts.find((c) => c.id === 'Nail')!
		expect(nails.qty).toBe(6)
		expect(nails.crafts).toBe(2)
	})

	it('uses the chosen blueprint tier', () => {
		const common = basicOf(breakdown([entry('Pal_Metal_Armor', 1, 'Common')]))
		const legendary = basicOf(breakdown([entry('Pal_Metal_Armor', 1, 'Legendary')]))
		expect(legendary.Ore).toBeGreaterThan(common.Ore)
		expect(legendary.Ancient_Civilization_Parts).toBe(5)
		expect(common.Ancient_Civilization_Parts).toBeUndefined()
	})

	it('stops at materials marked basic', () => {
		expect(basicOf(breakdown([entry('Nail', 5)], ['Ingot']))).toEqual({ Ingot: 1 })
		// Paldium is mined by default, not crushed from Stone
		expect(basicOf(breakdown([entry('Pal_Sphere', 4)]))).toEqual({ Paldium_Fragment: 4 })
	})

	it('lists every step, deeper steps after the crafts they need', () => {
		const b = breakdown([entry('Nail', 10)])
		expect(b.crafts.map((c) => [c.id, c.level])).toEqual([
			['Ingot', 0],
			['Nail', 1]
		])
	})

	it('keeps a step right under the craft it needs, not under an unrelated one', () => {
		const ids = breakdown([entry('Pal_Sphere', 1), entry('Nail', 10)]).crafts.map((c) => c.id)
		expect(ids).toHaveLength(3)
		expect(ids.indexOf('Nail')).toBe(ids.indexOf('Ingot') + 1)
	})

	it('only crafts and gathers what you do not have yet', () => {
		// 3 of 10 Nails in hand: 7 more is still 2 crafts of 5; 1 Ingot in hand leaves 1 to smelt
		const b = breakdown([entry('Nail', 10)], undefined, { Nail: 3, Ingot: 1, Ore: 1 })
		expect(b.crafts.map((c) => [c.id, c.qty, c.have, c.crafts])).toEqual([
			['Ingot', 2, 1, 1],
			['Nail', 10, 3, 2]
		])
		expect(b.basic).toEqual([{ id: 'Ore', qty: 2, have: 1 }])
		// Having every Nail drops their ingredients entirely
		const all = breakdown([entry('Nail', 10)], undefined, { Nail: 10 })
		expect(all.crafts.map((c) => c.id)).toEqual(['Nail'])
		expect(all.basic).toEqual([])
	})

	it('treats a material marked basic as had, not crafted', () => {
		const b = breakdown([entry('Nail', 10)], ['Ingot'], { Ingot: 2 })
		expect(b.basic).toEqual([{ id: 'Ingot', qty: 2, have: 2 }])
		expect(b.crafts.map((c) => [c.id, c.level])).toEqual([['Nail', 0]])
	})

	it('builds structures from their costs', () => {
		const furnace = recipes.find((r) => r.name === 'Primitive Furnace')!
		const b = breakdown([entry(furnace.id, 2)])
		expect(b.crafts.at(-1)).toMatchObject({ id: furnace.id, crafts: 2 })
		expect(b.basic.length).toBeGreaterThan(0)
	})
})
