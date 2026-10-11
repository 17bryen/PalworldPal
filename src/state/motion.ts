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

/** How far behind real time position playback runs; a little over the gap between updates */
const DELAY_MS = 90
/**
 * Facing can't lag like position does: turning the camera has to feel instant. It follows the
 * newest update, projected ahead along the current turn rate for up to this long, and is eased
 * with this time constant so the steps between updates don't show.
 */
const YAW_PREDICT_MS = 80
const YAW_EASE_MS = 25
/** An update gap longer than this (a load screen, a teleport) restarts playback */
const RESET_GAP_MS = 1500
const KEEP = 24

const wrap180 = (deg: number) => ((((deg + 180) % 360) + 360) % 360) - 180

export class Motion {
	private samples: Sample[] = []
	private shownYaw: number | null = null
	private shownYawAt = 0
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
		if (last && (time - last.time > RESET_GAP_MS || time <= last.time - RESET_GAP_MS)) {
			this.samples = []
			this.shownYaw = null
		}
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
		return { ...this.positionAt(now), yaw: this.yawAt(now) }
	}

	private positionAt(now: number): { x: number; y: number } {
		const s = this.samples
		const target = now - DELAY_MS
		if (target <= s[0].time) return s[0]
		const last = s[s.length - 1]
		if (target >= last.time) return last
		let i = s.length - 1
		while (i > 0 && s[i - 1].time > target) i--
		const a = s[i - 1]
		const b = s[i]
		const t = (target - a.time) / (b.time - a.time)
		return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
	}

	private yawAt(now: number): number {
		const s = this.samples
		const last = s[s.length - 1]
		const prev = s[s.length - 2]
		let target = last.yaw
		if (prev && last.time - prev.time < 250) {
			const rate = (last.yaw - prev.yaw) / (last.time - prev.time)
			target += rate * Math.min(YAW_PREDICT_MS, Math.max(0, now - last.time))
		}
		if (this.shownYaw == null) this.shownYaw = target
		else {
			const dt = Math.max(0, now - this.shownYawAt)
			this.shownYaw += (target - this.shownYaw) * (1 - Math.exp(-dt / YAW_EASE_MS))
		}
		this.shownYawAt = now
		return this.shownYaw
	}

	clear() {
		this.samples = []
		this.clockOffset = null
		this.shownYaw = null
	}
}
