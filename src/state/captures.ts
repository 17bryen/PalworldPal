import { pals } from '../data/gamedata'

// Capture records are keyed by the game's pal ids; alpha catches may carry a BOSS_ prefix
const idByLower = new Map(pals.map((p) => [p.id.toLowerCase(), p.id]))

/** This app's id for a game pal id (case varies, alphas have a BOSS_ prefix), or undefined for humans and unknowns */
export const palIdFromGame = (gameId: string) => idByLower.get(gameId.replace(/^boss_/i, '').toLowerCase())

/** The game's capture counts as Paldeck catches per pal id, ignoring ids this app doesn't know */
export function normalizeCaptures(counts: Record<string, number>): Record<string, number> {
	const out: Record<string, number> = {}
	for (const [key, value] of Object.entries(counts)) {
		const id = palIdFromGame(key)
		if (id && value > 0) out[id] = (out[id] ?? 0) + value
	}
	return out
}
