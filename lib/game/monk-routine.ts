import { SHORTCUT_EXPLORERS } from "./walking-shortcuts"
import type { MonkActivity } from "./monks"
import type { monkWander, WanderSpot } from "./monk-wander"

type Grounds = ReturnType<typeof monkWander>
export interface MonkRoutine extends WanderSpot {
  route: WanderSpot[]
  pause: number
  activity: MonkActivity
  destination: "grounds" | "prayer" | "home"
  outings: number
  processionConsidered?: boolean
  prayerSpot: WanderSpot | undefined
}

export function createMonkRoutine(grounds: Grounds, index: number, rng: () => number): MonkRoutine {
  return {
    ...grounds.spots[index % grounds.spots.length], route: [], pause: index * 2 + rng() * 2,
    activity: "resting", destination: "grounds", outings: 0,
    prayerSpot: grounds.prayerSpots[index % grounds.prayerSpots.length],
  }
}

/** A regular rhythm of entering, kneeling at the relic, and returning outside. */
export function stepMonkRoutine(s: MonkRoutine, grounds: Grounds, rng: () => number, speed: number, dt: number): void {
  if (dt <= 0) return
  if (s.pause > 0) { s.pause = Math.max(0, s.pause - dt); return }
  if (!s.route.length) {
    const pray = s.destination === "grounds" && s.outings === 0 && s.prayerSpot
    const goal = pray || grounds.spots[Math.floor(rng() * grounds.spots.length)]
    s.route = grounds.route(s, goal, rng() < SHORTCUT_EXPLORERS)
    if (!s.route.length) { s.pause = 2; return }
    s.destination = pray ? "prayer" : "grounds"
    s.activity = "walking"
  }
  let distance = speed * dt
  while (s.route.length) {
    const target = s.route[0]
    const dx = target.x - s.x, dz = target.z - s.z, length = Math.hypot(dx, dz)
    if (length > distance) {
      const t = distance / length
      s.x += dx * t; s.y += (target.y - s.y) * t; s.z += dz * t
      return
    }
    s.x = target.x; s.y = target.y; s.z = target.z
    distance -= length
    s.route.shift()
  }
  if (s.destination === "prayer") {
    s.processionConsidered = false
    s.activity = "praying"
    s.pause = 10 + rng() * 6
    s.outings = 2
  } else {
    s.activity = "resting"
    s.pause = 2 + rng() * 5
    s.outings = Math.max(0, s.outings - 1)
  }
}
