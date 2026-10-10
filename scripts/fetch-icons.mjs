// Downloads pal and work suitability icons from PalCalc's repo
// (https://github.com/tylercamp/palcalc) into public/. Run with `npm run icons`; existing files
// are kept, so rerunning after `npm run data` only fetches new pals.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const SOURCE = 'https://raw.githubusercontent.com/tylercamp/palcalc/main/PalCalc.UI/Resources'
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
	const res = await fetch(url)
	if (!res.ok) return `HTTP ${res.status}`
	writeFileSync(dest, Buffer.from(await res.arrayBuffer()))
	return 'fetched'
}

const { pals } = JSON.parse(readFileSync(path.join(ROOT, 'src', 'data', 'gamedata.json'), 'utf8'))
mkdirSync(path.join(PUBLIC, 'pals'), { recursive: true })
mkdirSync(path.join(PUBLIC, 'work'), { recursive: true })

const failed = []
let fetched = 0
const jobs = [
	...pals.map((p) => [`${SOURCE}/Pals/${encodeURIComponent(p.name)}.png`, path.join(PUBLIC, 'pals', `${p.id}.png`), p.name]),
	...Object.entries(WORK_FILES).map(([kind, file]) => [`${SOURCE}/${file}.png`, path.join(PUBLIC, 'work', `${kind}.png`), kind])
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
