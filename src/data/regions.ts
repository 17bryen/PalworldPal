// World Tree spawn data, read from paldb.cc's datamined spawner tables (site data v1.0.5,
// 2026-09-15) and checked against each pal's spawner list. The game database PalCalc exports
// has no spawn locations, so update this by hand after big content patches.

export type WorldTreePresence = 'only' | 'mostly' | 'also'

/** Field spawns, alphas included, exist only in the World Tree */
const ONLY = [
	'SnowTigerBeastman', // Bastigor
	'ThunderBird_Ice', // Beakon Cryst
	'GrassMinotaur_Ice', // Elgrove Cryst
	'Kirin_Ice', // Univolt Cryst
	'GhostDragon_Fire', // Eidrolon Ignis
	'SnakeGirl', // Venusa
	'LanternButler', // Loomen
	'MushroomLady', // Mycora
	'WhiteMoth_Neutral', // Sibelyx Primo
	'ThunderDragonMan', // Orserk
	'ElecSnail_Ground', // Snock Terra
	'ThiefBird', // Roujay
	'FlowerDoll_Fire', // Petallia Ignis
	'IceNarwhal_Fire', // Whalaska Ignis
	'MoonQueen', // Selyne
	'BlueSkyDragon', // Shaolong
	'NightBlueHorse_Neutral', // Starryon Primo
	'MonochromeQueen', // Solenne
	'VolcanoDragon_Ice', // Moldron Cryst (alpha)
	'DomeArmorDragon', // Aegidron (alpha)
	'WhiteDeer_Dark', // Celesdir Noct (alpha)
	'KabukiMan', // Renjishi (alpha)
	'Mothman', // Silvance (boss)
	'FlowerPrince' // Dandilord (boss)
]

/** Field spawns only in the World Tree, but a one-off alpha or other source exists elsewhere */
const MOSTLY = [
	'ElecPanda', // Grizzbolt
	'LilyQueen', // Lyleen
	'GrassGolem_Dark', // Dualith Noct
	'MoonChild', // Wistella
	'CubeTurtle_Neutral' // Tetroise Primo
]

/** Spawns in the World Tree and in other regions */
const ALSO = [
	'GrassGolem', // Dualith
	'Horus', // Faleris
	'Horus_Water', // Faleris Aqua
	'FoxExorcist', // Flaracle
	'OctopusGirl_Neutral', // Gloopie Primo
	'WingGolem', // Knocklem
	'WingGolem_Fire', // Knocklem Ignis
	'LilyQueen_Dark', // Lyleen Noct
	'DarkFlameFox', // Majex
	'MimicDog', // Mimog
	'GrassPanda_Electric', // Mossanda Lux
	'ThunderDog_Ice', // Rayhound Cryst
	'SwordCutlassfish_Fire', // Skutlass Ignis
	'GhostBlackCat', // Wispaw
	'ClownRabbit', // Dupin
	'KingSunfish_Thunder' // Solmora Lux
]

export const worldTree = new Map<string, WorldTreePresence>([
	...ONLY.map((id) => [id, 'only'] as const),
	...MOSTLY.map((id) => [id, 'mostly'] as const),
	...ALSO.map((id) => [id, 'also'] as const)
])
