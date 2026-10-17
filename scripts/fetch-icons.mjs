// Downloads images into public/: pal and work suitability icons from PalCalc's repo
// (https://github.com/tylercamp/palcalc), and merchant item icons, NPC portraits, map tiles and map
// marker icons from paldb.cc's image CDN. Run with `npm run icons`; existing files are kept, so
// rerunning only fetches new ones.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const SOURCE = 'https://raw.githubusercontent.com/tylercamp/palcalc/main/PalCalc.UI/Resources'
const PALDB_ITEMS = 'https://cdn.paldb.cc/image/Others/InventoryItemIcon/Texture'
const PALDB_PORTRAITS = 'https://cdn.paldb.cc/image/Pal/Texture/PalIcon/Normal'
const PALDB_ELEMENTS = 'https://cdn.paldb.cc/image/Pal/Texture/UI/InGame'
const PALDB_BUILD = 'https://cdn.paldb.cc/image/Pal/Texture/BuildObject/PNG'
// The game's element icon numbers
const ELEMENT_FILES = { Neutral: '00', Fire: '01', Water: '02', Electric: '03', Grass: '04', Dark: '05', Dragon: '06', Ground: '07', Ice: '08' }
/** Map tiles: 512 px webp tiles, zoom 0 (whole map) to 4 (16 x 16 tiles) */
const MAP_TILES = { main: 'https://cdn.paldb.cc/image/map8', worldTree: 'https://cdn.paldb.cc/image/treemap8' }
const MAP_MAX_ZOOM = 4
/** Currency icons the merchant page shows next to prices */
const CURRENCY_ICONS = ['T_itemicon_Material_Money', 'T_icon_item_Jewelry_BountyProof_1']
/** Pals renamed in build-data.mjs whose icon file still uses the game's name */
const ICON_FILE_NAMES = { PlantSlime_Flower: 'Gumoss' }
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const PUBLIC = path.join(ROOT, 'public')

const WORK_FILES = {
	kindling: 'Kindling',
	watering: 'Watering',
	planting: 'Planting',
	electricity: 'ElectricityGeneration',
	handiwork: 'Handiwork',
	gathering: 'Gathering',
	lumbering: 'Lumbering',
	mining: 'Mining',
	medicine: 'MedicineProduction',
	cooling: 'Cooling',
	transporting: 'Transporting',
	farming: 'Farming'
}

async function download(url, dest) {
	if (existsSync(dest)) return 'kept'
	const res = await fetch(url, { headers: { 'User-Agent': 'PalworldPal icon fetch' } })
	if (!res.ok) return `HTTP ${res.status}`
	writeFileSync(dest, Buffer.from(await res.arrayBuffer()))
	return 'fetched'
}

const { pals } = JSON.parse(readFileSync(path.join(ROOT, 'src', 'data', 'gamedata.json'), 'utf8'))
mkdirSync(path.join(PUBLIC, 'pals'), { recursive: true })
mkdirSync(path.join(PUBLIC, 'work'), { recursive: true })
mkdirSync(path.join(PUBLIC, 'items'), { recursive: true })
mkdirSync(path.join(PUBLIC, 'npc'), { recursive: true })
mkdirSync(path.join(PUBLIC, 'elements'), { recursive: true })
mkdirSync(path.join(PUBLIC, 'build'), { recursive: true })

const { towns } = JSON.parse(readFileSync(path.join(ROOT, 'src', 'data', 'merchants.json'), 'utf8'))
const merchants = towns.flatMap((t) => t.merchants)
const { expeditions } = JSON.parse(readFileSync(path.join(ROOT, 'src', 'data', 'expeditions.json'), 'utf8'))
const itemIcons = new Set([
	...CURRENCY_ICONS,
	...merchants.flatMap((m) => m.stock.map((s) => s.icon).filter(Boolean)),
	...expeditions.flatMap((e) => e.rewards.flat().map((o) => o.icon).filter(Boolean))
])
// Recipes: items and their materials use item icons; structures their build menu icons
const recipeData = JSON.parse(readFileSync(path.join(ROOT, 'src', 'data', 'recipes.json'), 'utf8'))
for (const r of recipeData.items) if (r.icon && r.group !== 'Structure') itemIcons.add(r.icon)
for (const m of Object.values(recipeData.materials)) if (m.icon) itemIcons.add(m.icon)
const buildIcons = new Set(recipeData.items.filter((r) => r.group === 'Structure' && r.icon).map((r) => r.icon))
const portraits = new Set(merchants.map((m) => m.portrait))

const mapIcons = JSON.parse(readFileSync(path.join(ROOT, 'scripts', 'map-icons.json'), 'utf8'))
const tiles = []
for (const [map, base] of Object.entries(MAP_TILES)) {
	mkdirSync(path.join(PUBLIC, 'map', map), { recursive: true })
	for (let z = 0; z <= MAP_MAX_ZOOM; z++) {
		for (let x = 0; x < 2 ** z; x++) {
			for (let y = 0; y < 2 ** z; y++) {
				const name = `z${z}x${x}y${y}.webp`
				tiles.push([`${base}/${name}`, path.join(PUBLIC, 'map', map, name), `${map} ${name}`])
			}
		}
	}
}
mkdirSync(path.join(PUBLIC, 'map', 'icons'), { recursive: true })

const failed = []
let fetched = 0
const jobs = [
	...pals.map((p) => [`${SOURCE}/Pals/${encodeURIComponent(ICON_FILE_NAMES[p.id] ?? p.name)}.png`, path.join(PUBLIC, 'pals', `${p.id}.png`), p.name]),
	...Object.entries(WORK_FILES).map(([kind, file]) => [`${SOURCE}/${file}.png`, path.join(PUBLIC, 'work', `${kind}.png`), kind]),
	...[...itemIcons].map((icon) => [`${PALDB_ITEMS}/${icon}.webp`, path.join(PUBLIC, 'items', `${icon}.webp`), icon]),
	...[...portraits].map((p) => [`${PALDB_PORTRAITS}/${p}_icon_normal.webp`, path.join(PUBLIC, 'npc', `${p}.webp`), p]),
	...[...buildIcons].map((icon) => [`${PALDB_BUILD}/${icon}.webp`, path.join(PUBLIC, 'build', `${icon}.webp`), icon]),
	...Object.entries(ELEMENT_FILES).map(([name, n]) => [`${PALDB_ELEMENTS}/T_Icon_element_s_${n}.webp`, path.join(PUBLIC, 'elements', `${name}.webp`), name]),
	...tiles,
	...Object.entries(mapIcons).map(([name, url]) => [url, path.join(PUBLIC, 'map', 'icons', name), name])
]
for (let i = 0; i < jobs.length; i += 16) {
	await Promise.all(
		jobs.slice(i, i + 16).map(async ([url, dest, label]) => {
			const result = await download(url, dest)
			if (result === 'fetched') fetched++
			else if (result !== 'kept') failed.push(`${label} (${result})`)
		})
	)
}

console.log(`Fetched ${fetched} icons into ${PUBLIC}`)
if (failed.length) console.log(`Missing: ${failed.join(', ')}`)
