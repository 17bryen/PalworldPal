import { pals } from '../data/gamedata'

// Capture records are keyed by the game's pal ids; alpha catches may carry a BOSS_ prefix
const idByLower = new Map(pals.map((p) => [p.id.toLowerCase(), p.id]))

/** The game's capture counts as Paldeck catches per pal id, ignoring ids this app doesn't know */
export function normalizeCaptures(counts: Record<string, number>): Record<string, number> {
	const out: Record<string, number> = {}
	for (const [key, value] of Object.entries(counts)) {
		const id = idByLower.get(key.replace(/^boss_/i, '').toLowerCase())
		if (id && value > 0) out[id] = (out[id] ?? 0) + value
	}
	return out
}
