// Builds src/data/gamedata.json from PalCalc's game-extracted database
// (https://github.com/tylercamp/palcalc, MIT). Run with `npm run data` after a game update.

import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const SOURCE = 'https://raw.githubusercontent.com/tylercamp/palcalc/main/PalCalc.Model'
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data', 'gamedata.json')

async function fetchJson(name) {
	const res = await fetch(`${SOURCE}/${name}`)
	if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`)
	// PalCalc writes its JSON with a BOM
	return JSON.parse((await res.text()).replace(/^﻿/, ''))
}

const db = await fetchJson('db.json')
const breeding = await fetchJson('breeding.json')

const pals = [...db.Pals].sort((a, b) =>
	a.Id.PalDexNo - b.Id.PalDexNo || Number(a.Id.IsVariant) - Number(b.Id.IsVariant) || a.Name.localeCompare(b.Name)
)
const index = new Map(pals.map((p, i) => [p.InternalName, i]))

// Pals the game gives the same name as another pal
const NAME_OVERRIDES = { PlantSlime_Flower: 'Gumoss (Flower)' }

const WORK_KEYS = {
	Kindling: 'kindling',
	Watering: 'watering',
	Planting: 'planting',
	GenerateElectricity: 'electricity',
	Handiwork: 'handiwork',
	Gathering: 'gathering',
	Lumbering: 'lumbering',
	Mining: 'mining',
	MedicineProduction: 'medicine',
	Cooling: 'cooling',
	Transporting: 'transporting',
	Farming: 'farming'
}

// Rough minutes to find and catch one: rarer and higher-level spawns take longer
const catchMinutes = (p) =>
	Math.round(2 + Math.min(p.Rarity, 10) * 1.5 + (p.MinWildLevel ?? 0) / 10 + (p.Id.IsVariant ? 3 : 0) + (p.Rarity >= 20 ? 30 : 0))

const outPals = pals.map((p) => {
	const gender = db.BreedingGenderProbability[p.InternalName] ?? { MALE: 0.5, FEMALE: 0.5 }
	return {
		id: p.InternalName,
		name: NAME_OVERRIDES[p.InternalName] ?? p.Name,
		dex: p.Id.PalDexNo,
		variant: p.Id.IsVariant,
		rarity: p.Rarity,
		legendary: p.Rarity >= 20,
		wild: p.MinWildLevel != null,
		minWildLevel: p.MinWildLevel,
		maxWildLevel: p.MaxWildLevel,
		catchMinutes: catchMinutes(p),
		maleChance: gender.MALE,
		work: Object.fromEntries(
			Object.entries(WORK_KEYS).map(([key, name]) => [name, p.WorkSuitability?.[key] ?? 0])
		)
	}
})

// Flat n*n matrix of child indices; -1 marks a pair whose result depends on gender
const n = pals.length
const children = new Array(n * n).fill(-2)
const genderRules = []
for (const e of breeding.Breeding) {
	const a = index.get(e.Parent1InternalName)
	const b = index.get(e.Parent2InternalName)
	const c = index.get(e.ChildInternalName)
	if (a == null || b == null || c == null) continue
	if (e.Parent1Gender === 'WILDCARD' && e.Parent2Gender === 'WILDCARD') {
		children[a * n + b] = c
		children[b * n + a] = c
	} else {
		children[a * n + b] = -1
		children[b * n + a] = -1
		genderRules.push({
			a,
			aGender: e.Parent1Gender === 'MALE' ? 'M' : 'F',
			b,
			bGender: e.Parent2Gender === 'MALE' ? 'M' : 'F',
			child: c
		})
	}
}
const missing = children.filter((c) => c === -2).length
if (missing > 0) throw new Error(`${missing} pair results are missing from breeding.json`)

// Standard passives keyed by display name; a few names map to more than one internal id
const passives = new Map()
for (const s of db.PassiveSkills) {
	if (!s.IsStandardPassiveSkill || passives.has(s.Name)) continue
	// `copyable`: can roll on wild pals, which is also what Yakumo's partner skill can copy
	passives.set(s.Name, { name: s.Name, rank: s.Rank, description: s.Description ?? '', copyable: s.RandomInheritanceAllowed })
}

const weights = (w) => Object.fromEntries(Object.entries(w).map(([k, v]) => [Number(k), v]))

const out = {
	source: `PalCalc db ${db.Version}`,
	builtAt: new Date().toISOString().slice(0, 10),
	pals: outPals,
	passives: [...passives.values()].sort((a, b) => b.rank - a.rank || a.name.localeCompare(b.name)),
	passiveInheritanceWeights: weights(db.BreedingMechanics.PassiveInheritanceWeights),
	passiveRandomWeights: weights(db.BreedingMechanics.PassiveRandomWeights),
	children,
	genderRules
}

writeFileSync(OUT, JSON.stringify(out))
console.log(`Wrote ${outPals.length} pals, ${out.passives.length} passives, ${genderRules.length} gender rules to ${OUT}`)
