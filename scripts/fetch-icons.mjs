// Downloads icons into public/: pal and work suitability icons from PalCalc's repo
// (https://github.com/tylercamp/palcalc), and merchant item icons and NPC portraits from paldb.cc's
// image CDN. Run with `npm run icons`; existing files are kept, so rerunning only fetches new ones.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const SOURCE = 'https://raw.githubusercontent.com/tylercamp/palcalc/main/PalCalc.UI/Resources'
const PALDB_ITEMS = 'https://cdn.paldb.cc/image/Others/InventoryItemIcon/Texture'
const PALDB_PORTRAITS = 'https://cdn.paldb.cc/image/Pal/Texture/PalIcon/Normal'
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

const { towns } = JSON.parse(readFileSync(path.join(ROOT, 'src', 'data', 'merchants.json'), 'utf8'))
const merchants = towns.flatMap((t) => t.merchants)
const itemIcons = new Set([...CURRENCY_ICONS, ...merchants.flatMap((m) => m.stock.map((s) => s.icon).filter(Boolean))])
const portraits = new Set(merchants.map((m) => m.portrait))

const failed = []
let fetched = 0
const jobs = [
	...pals.map((p) => [`${SOURCE}/Pals/${encodeURIComponent(ICON_FILE_NAMES[p.id] ?? p.name)}.png`, path.join(PUBLIC, 'pals', `${p.id}.png`), p.name]),
	...Object.entries(WORK_FILES).map(([kind, file]) => [`${SOURCE}/${file}.png`, path.join(PUBLIC, 'work', `${kind}.png`), kind]),
	...[...itemIcons].map((icon) => [`${PALDB_ITEMS}/${icon}.webp`, path.join(PUBLIC, 'items', `${icon}.webp`), icon]),
	...[...portraits].map((p) => [`${PALDB_PORTRAITS}/${p}_icon_normal.webp`, path.join(PUBLIC, 'npc', `${p}.webp`), p])
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
