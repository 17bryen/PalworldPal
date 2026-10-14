// Builds src/data/expeditions.json: every expedition with its rewards (palpedia.com/expeditions),
// each pal's elements for the element requirements (paldb.cc/en/Pals), and an icon for each reward
// item from paldb's item pages. Run with `npm run expeditions` after a game update, then
// `npm run icons` to download any new icons.

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = path.join(ROOT, 'src', 'data', 'expeditions.json')
const HEADERS = { 'User-Agent': 'PalworldPal data build' }

const decode = (s) =>
	s
		.replace(/&#0*39;|&apos;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&times;/g, 'x')

async function page(url) {
	const res = await fetch(url, { headers: HEADERS })
	if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
	return res.text()
}

// ---- Expeditions ----
const CARD = '<h3 class="text-lg font-bold text-white drop-shadow-lg">'
const expeditionsHtml = await page('https://palpedia.com/expeditions')
const hardAt = expeditionsHtml.indexOf('Hard Mode Expeditions')
const expeditions = []
let at = expeditionsHtml.indexOf(CARD)
while (at >= 0) {
	const next = expeditionsHtml.indexOf(CARD, at + CARD.length)
	const card = expeditionsHtml.slice(at + CARD.length, next < 0 ? undefined : next)
	const name = decode(card.slice(0, card.indexOf('</h3>'))).trim()
	const duration = card.match(/<span class="text-gray-200 drop-shadow">\s*([0-9hm ]+)\s*<\/span>/)[1]
	const minutes = [...duration.matchAll(/(\d+)([hm])/g)].reduce((sum, [, n, unit]) => sum + Number(n) * (unit === 'h' ? 60 : 1), 0)
	const requirement = decode(card).match(/Requires\s*(\d+)\D{1,3}?\s*([A-Za-z]+) element/)
	const rewards = card
		.split('<div class="flex items-center gap-2 rounded p-2')
		.slice(1)
		.map((slot) =>
			[
				...slot.matchAll(
					/<span class="text-sm text-white hover:underline">([^<]+)<\/span>\s*<span class="text-xs text-gray-400">\s*(\d+)(?:\s*-\s*(\d+))?\s*<\/span>/g
				)
			].map(([, item, min, max]) => ({ item: decode(item).trim(), min: Number(min), max: Number(max ?? min) }))
		)
		.filter((slot) => slot.length)
	expeditions.push({
		name,
		hard: hardAt >= 0 && at > hardAt,
		risk: card.match(/Risk:\s*([A-Za-z ]+?)\s*</)[1].trim(),
		minutes,
		firepower: Number(card.match(/([\d,]+)\s*Firepower/)[1].replace(/,/g, '')),
		require: requirement ? { count: Number(requirement[1]), element: requirement[2] } : null,
		rewards
	})
	at = next
}
if (expeditions.length < 10) throw new Error(`Only found ${expeditions.length} expeditions; the page layout may have changed`)

// ---- Pal elements ----
const { pals } = JSON.parse(readFileSync(path.join(ROOT, 'src', 'data', 'gamedata.json'), 'utf8'))
const palsHtml = await page('https://paldb.cc/en/Pals')
const elementsById = new Map()
for (const card of palsHtml.split('<div class="col" data-filters="').slice(1)) {
	const id = card.match(/data-pal-id="([^"]+)"/)?.[1]
	if (!id || elementsById.has(id.toLowerCase())) continue
	const head = card.split('<div class="my-1">')[0]
	elementsById.set(id.toLowerCase(), [...head.matchAll(/T_Icon_element_s_\d+\.webp"[^>]*data-bs-title="([^"]+)"/g)].map((m) => m[1]))
}
// Variants paldb doesn't list separately share their base pal's elements
const SAME_ELEMENTS = { PlantSlime_Flower: 'PlantSlime' }
const elements = {}
const noElements = []
for (const p of pals) {
	const found = elementsById.get(p.id.toLowerCase()) ?? elementsById.get((SAME_ELEMENTS[p.id] ?? '').toLowerCase())
	if (found?.length) elements[p.id] = found
	else noElements.push(p.id)
}

// ---- Item icons ----
async function itemIcon(name) {
	const html = decode(await page(`https://paldb.cc/en/${encodeURIComponent(name.replace(/ /g, '_')).replace(/%27/g, "'")}`))
	// The item's own icon sits right before its name; other icons on the page belong to related items
	const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
	const own = html.match(new RegExp(`InventoryItemIcon/Texture/(T_[A-Za-z0-9_]+)\\.webp"[^>]*>\\s*${escaped}\\s*<`))
	return own?.[1] ?? html.match(/InventoryItemIcon\/Texture\/(T_[A-Za-z0-9_]+)\.webp/)?.[1] ?? null
}
const items = [...new Set(expeditions.flatMap((e) => e.rewards.flat().map((o) => o.item)))]
const icons = {}
for (let i = 0; i < items.length; i += 8) {
	await Promise.all(
		items.slice(i, i + 8).map(async (item) => {
			try {
				const icon = await itemIcon(item)
				if (icon) icons[item] = icon
			} catch {
				// Left without an icon; the app shows the name alone
			}
		})
	)
}
for (const e of expeditions) for (const slot of e.rewards) for (const o of slot) if (icons[o.item]) o.icon = icons[o.item]

writeFileSync(
	OUT,
	JSON.stringify({
		source: `palpedia.com/expeditions (rewards), paldb.cc (elements, item icons), ${new Date().toISOString().slice(0, 10)}`,
		expeditions,
		elements
	})
)
console.log(`Wrote ${expeditions.length} expeditions, elements for ${Object.keys(elements).length} pals, ${Object.keys(icons).length}/${items.length} item icons`)
if (noElements.length) console.log(`No elements for: ${noElements.join(', ')}`)
