// Smooth player motion from the mod's updates. Updates arrive 10-20 times a second with uneven
// gaps, so instead of chasing the latest one, motion is played back a fixed moment behind real
// time and blended between the two updates around that moment, the way multiplayer games
// smooth other players. The mod's own clock (mod 1.2+) times each update exactly; without it,
// arrival time is used.

export interface Pose {
	x: number
	y: number
	/** Degrees, unwrapped so blending never spins the long way round */
	yaw: number
}

interface Sample extends Pose {
	/** performance.now() time the update describes */
	time: number
}

/** How far behind real time playback runs; a little over the gap between updates */
const DELAY_MS = 90
/** An update gap longer than this (a load screen, a teleport) restarts playback */
const RESET_GAP_MS = 1500
const KEEP = 24

const wrap180 = (deg: number) => ((((deg + 180) % 360) + 360) % 360) - 180

export class Motion {
	private samples: Sample[] = []
	/** Converts the mod's clock to performance.now(); the smallest seen delivery delay */
	private clockOffset: number | null = null

	push(update: { x: number; y: number; yaw: number; t?: number }, arrivedAt = performance.now()) {
		let time = arrivedAt
		if (update.t != null) {
			const modMs = update.t * 1000
			const offset = arrivedAt - modMs
			// The fastest delivery is the truest offset; restart it if the mod's clock jumps
			if (this.clockOffset == null || offset < this.clockOffset || offset - this.clockOffset > RESET_GAP_MS) this.clockOffset = offset
			time = modMs + this.clockOffset
		}
		const last = this.samples[this.samples.length - 1]
		if (last && (time - last.time > RESET_GAP_MS || time <= last.time - RESET_GAP_MS)) this.samples = []
		const prev = this.samples[this.samples.length - 1]
		if (prev && time <= prev.time) return
		const yaw = prev ? prev.yaw + wrap180(update.yaw - prev.yaw) : update.yaw
		this.samples.push({ time, x: update.x, y: update.y, yaw })
		if (this.samples.length > KEEP) this.samples.shift()
	}

	/** Where to draw the player at this moment, or null before the first update */
	at(now = performance.now()): Pose | null {
		const s = this.samples
		if (!s.length) return null
		const target = now - DELAY_MS
		if (target <= s[0].time) return s[0]
		const last = s[s.length - 1]
		if (target >= last.time) return last
		let i = s.length - 1
		while (i > 0 && s[i - 1].time > target) i--
		const a = s[i - 1]
		const b = s[i]
		const t = (target - a.time) / (b.time - a.time)
		return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, yaw: a.yaw + (b.yaw - a.yaw) * t }
	}

	clear() {
		this.samples = []
		this.clockOffset = null
	}
}
