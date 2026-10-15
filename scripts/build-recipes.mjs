// Builds src/data/recipes.json: every craftable item and buildable structure with its materials,
// from paldb.cc (game data v1.0.5). Gear comes in blueprint tiers (Common to Legendary), each its
// own recipe. Item pages add how many one craft makes and where it's crafted. Run with
// `npm run recipes`, then `npm run icons` for any new icons. Set RECIPES_CACHE to a folder to keep
// the downloaded pages between runs.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = path.join(ROOT, 'src', 'data', 'recipes.json')
const BASE = 'https://paldb.cc/en/'
const CACHE = process.env.RECIPES_CACHE
if (CACHE) mkdirSync(CACHE, { recursive: true })

// The crafting bench's tabs, and the build menu categories, by paldb's category pages
const ITEM_PAGES = {
	Sphere: 'Spheres',
	Sphere_Module: 'Spheres',
	Weapon: 'Weapon',
	Ammo: 'Weapon',
	Armor: 'Armor',
	Accessory: 'Armor',
	Glider: 'Armor',
	Consumable: 'Consumable',
	Ingredient: 'Consumable',
	Material: 'Material'
}
const STRUCTURE_PAGES = ['Production', 'Pal', 'Storage', 'Food', 'Infrastructure']
// Gathering and mining gear sits on its own tab in game
const TOOL = /(^|_)(Stone|Metal|Refined_Metal|Pal_Metal|Old|Plasteel|Hexolite|Ancient|Stone_)?_?(Pickaxe|Axe)$|Pickaxe|_Axe$|^Axe|Metal_Detector|Fishing_Rod|Grappling_Gun|Lantern|Torch|Pal_Scanner|Bucket/
const RARITIES = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary']

const decode = (s) =>
	s
		.replace(/&#0*39;|&apos;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&amp;/g, '&')
		.replace(/&ndash;/g, '-')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
const text = (html) => decode(html.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim()
const iconOf = (src) => src?.match(/\/(T_[A-Za-z0-9_]+)\.webp/)?.[1] ?? null

async function page(slug) {
	const file = CACHE && path.join(CACHE, `${slug.replace(/[^A-Za-z0-9_-]/g, '_')}.html`)
	if (file && existsSync(file)) return readFileSync(file, 'utf8')
	for (let attempt = 0; ; attempt++) {
		const res = await fetch(BASE + slug, { headers: { 'User-Agent': 'PalworldPal data build' } })
		if (res.ok) {
			const html = await res.text()
			if (file) writeFileSync(file, html)
			return html
		}
		if (attempt >= 3 || res.status === 404) throw new Error(`${slug}: HTTP ${res.status}`)
		await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)))
	}
}

/** Materials in a block: each link to an item followed by its count */
function materials(html, countPattern) {
	return [...html.matchAll(countPattern)].map((m) => ({ id: m[1], name: decode(m[3]).trim(), icon: iconOf(m[2]), qty: Number(m[4]) }))
}
const CARD_MATERIAL = /<a class="itemname"[^>]*href="([^"]+)"><img[^>]*src="([^"]+)"[^>]*\/>([^<]+)<\/a><\/div>\s*<div>(\d+)<\/div>/g
const ROW_MATERIAL = /<a class="itemname"[^>]*href="([^"]+)"><img[^>]*src="([^"]+)"[^>]*\/>([^<]+)<\/a>\s*<small class="itemQuantity">(\d+)<\/small>/g

/** The cards on a category page: one per item or structure, and one per blueprint tier */
function cards(html) {
	return html
		.split('<div class="card itemPopup">')
		.slice(1)
		.map((card) => {
			const head = card.match(/<a class="itemname"[^>]*href="([^"]+)">([^<]+)<\/a>/)
			if (!head) return null
			const recipes = card.split('<div class="recipes">')[1] ?? ''
			return {
				id: head[1],
				name: decode(head[2]).trim(),
				rarity: RARITIES.find((r) => card.includes(`>${r}</span>`)) ?? null,
				icon: iconOf(card.match(/hover_icon_bg[\s\S]*?<img[^>]*src="([^"]+)"/)?.[1]),
				tech: Number(card.match(/>Technology<\/span><\/span><span class="border p-1">(\d+)</)?.[1] ?? 0) || null,
				description: text(card.match(/<div class="card-body py-2">\s*<div>([\s\S]*?)<\/div>\s*<\/div>/)?.[1] ?? ''),
				materials: materials(recipes, CARD_MATERIAL)
			}
		})
		.filter((c) => c && c.materials.length)
}

/** From an item's own page: where it's crafted and every recipe that makes it, with how many */
function production(html, id) {
	const stations = new Set()
	const recipes = []
	for (const section of html.split('data-i18n="convert_item_product_tab_title"').slice(1)) {
		const block = section.split('</table>')[0]
		const head = block.split('<table')[0]
		for (const m of head.matchAll(/<a class="itemname[^"]*"[^>]*href="([^"]+)"><img[^>]*\/>([^<]+)<\/a>/g)) stations.add(decode(m[2]).trim())
		for (const row of block.split('<tr><td>').slice(1)) {
			const [inputs, product] = row.split('<td>')
			const made = product?.match(/href="([^"]+)"[\s\S]*?<small class="itemQuantity">(\d+)<\/small>/)
			if (!made || made[1] !== id) continue
			recipes.push({ makes: Number(made[2]), materials: materials(inputs, ROW_MATERIAL) })
		}
	}
	return { stations: [...stations], recipes }
}

// ---- Items ----
const items = new Map()
const icons = new Map()
for (const [slug, group] of Object.entries(ITEM_PAGES)) {
	for (const card of cards(await page(slug))) {
		for (const m of card.materials) if (m.icon) icons.set(m.id, m.icon)
		const key = card.id
		if (!items.has(key)) {
			items.set(key, {
				id: key,
				name: card.name,
				group: group === 'Weapon' && TOOL.test(key) ? 'Tool' : group,
				icon: card.icon,
				tech: card.tech,
				description: card.description,
				tiers: []
			})
		}
		const item = items.get(key)
		item.tech ??= card.tech
		if (!item.tiers.some((t) => t.rarity === card.rarity && JSON.stringify(t.materials) === JSON.stringify(card.materials))) {
			item.tiers.push({ rarity: card.rarity, materials: card.materials.map(({ id, qty }) => ({ id, qty })) })
		}
	}
}
for (const item of items.values()) item.tiers.sort((a, b) => RARITIES.indexOf(a.rarity) - RARITIES.indexOf(b.rarity))

// Gear makes one per craft; everything else gets its batch size, stations and other recipes from its page
const detailed = [...items.values()].filter((i) => !['Weapon', 'Tool', 'Armor'].includes(i.group) || i.tiers.length === 1)
let done = 0
for (let i = 0; i < detailed.length; i += 4) {
	await Promise.all(
		detailed.slice(i, i + 4).map(async (item) => {
			try {
				const { stations, recipes } = production(await page(item.id), item.id)
				if (stations.length) item.stations = stations
				const first = recipes[0]
				if (first && first.makes > 1) item.makes = first.makes
				// Other ways to make it (Paldium Fragment from Stone or from Meteorite Fragment)
				const others = recipes.slice(1).filter((r) => JSON.stringify(r.materials.map((m) => [m.id, m.qty])) !== JSON.stringify(item.tiers[0].materials.map((m) => [m.id, m.qty])))
				if (others.length) item.alternatives = others.map((r) => ({ makes: r.makes, materials: r.materials.map(({ id, qty }) => ({ id, qty })) }))
				for (const r of recipes) for (const m of r.materials) if (m.icon) icons.set(m.id, m.icon)
			} catch (err) {
				console.warn(`  ${item.id}: ${err.message}`)
			}
		})
	)
	done += 4
	if (done % 40 === 0) console.log(`  ${Math.min(done, detailed.length)}/${detailed.length} item pages`)
	if (!CACHE) await new Promise((r) => setTimeout(r, 250))
}

// ---- Structures ----
const structures = []
for (const category of STRUCTURE_PAGES) {
	for (const card of cards(await page(category))) {
		for (const m of card.materials) if (m.icon) icons.set(m.id, m.icon)
		if (structures.some((s) => s.id === card.id)) continue
		structures.push({
			id: card.id,
			name: card.name,
			group: 'Structure',
			category,
			icon: card.icon,
			tech: card.tech,
			description: card.description,
			tiers: [{ rarity: null, materials: card.materials.map(({ id, qty }) => ({ id, qty })) }]
		})
	}
}

// Names and icons for every material, including raw ones that have no recipe here
const names = {}
for (const item of items.values()) names[item.id] = item.name
const materialNames = new Map()
for (const slug of [...Object.keys(ITEM_PAGES), ...STRUCTURE_PAGES]) {
	for (const m of (await page(slug)).matchAll(/<a class="itemname"[^>]*href="([^"]+)"><img[^>]*src="([^"]+)"[^>]*\/>([^<]+)<\/a>/g)) {
		if (!materialNames.has(m[1])) materialNames.set(m[1], decode(m[3]).trim())
		if (!icons.has(m[1]) && iconOf(m[2])) icons.set(m[1], iconOf(m[2]))
	}
}
const all = [...items.values(), ...structures]
const used = new Set(all.flatMap((i) => [...i.tiers, ...(i.alternatives ?? [])].flatMap((t) => t.materials.map((m) => m.id))))
const materialsOut = {}
for (const id of used) materialsOut[id] = { name: names[id] ?? materialNames.get(id) ?? id.replace(/_/g, ' '), icon: icons.get(id) ?? null }

writeFileSync(OUT, JSON.stringify({ source: `paldb.cc (game data v1.0.5), ${new Date().toISOString().slice(0, 10)}`, items: all, materials: materialsOut }))
const counts = {}
for (const i of all) counts[i.category ?? i.group] = (counts[i.category ?? i.group] ?? 0) + 1
console.log(`Wrote ${all.length} recipes (${JSON.stringify(counts)}), ${Object.keys(materialsOut).length} materials`)
