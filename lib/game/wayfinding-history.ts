import type { Selection } from "./camera-store"
import type { DebugJourney } from "./wayfinding-debug"

export interface RouteChange {
  id: number
  time: number
  before: DebugJourney
  after: DebugJourney
}

const near = (a: DebugJourney["route"][number], b: DebugJourney["route"][number]) =>
  Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) < .05

/** Consuming waypoints and moving along a segment are progress, not a replan.
 * Road lanes move continuously; their logical direction/track identifies them. */
function changed(a: DebugJourney, b: DebugJourney) {
  if (a.destination !== b.destination || a.intent !== b.intent) return true
  if (a.intent?.startsWith("road:")) return false
  if ((a.route.length > 1) !== (b.route.length > 1)) return true
  let i = a.route.length - 1, j = b.route.length - 1
  for (; i > 0 && j > 0; i--, j--) {
    if (!near(a.route[i], b.route[j])) return true
  }
  if (i > 0 && b.route.length > 1) {
    // A shorter suffix can also be a newly chosen shortcut. It is ordinary
    // progress only if the actor actually reached the retained segment.
    const from = a.route[i], to = a.route[i + 1], at = b.route[0]
    const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z
    const length2 = dx * dx + dy * dy + dz * dz
    const t = length2 ? Math.max(0, Math.min(1, ((at.x - from.x) * dx + (at.y - from.y) * dy + (at.z - from.z) * dz) / length2)) : 0
    return !near(at, { x: from.x + dx * t, y: from.y + dy * t, z: from.z + dz * t })
  }
  return b.route.length > a.route.length
}

function copy(journey: DebugJourney): DebugJourney {
  return { ...journey, route: journey.route.map(p => ({ ...p })) }
}

/** Bounded, immutable debug observations. The clock is simulation time, so
 * pausing the game also pauses expiry. World replacement gets a fresh history. */
export class WayfindingHistory {
  private previous = new Map<string, DebugJourney>()
  private sequence = 0
  changes: RouteChange[] = []
  time = 0

  observe(journeys: DebugJourney[], time: number, pinned: number | null = null) {
    if (time < this.time) this.clear()
    this.time = time
    const next = new Map<string, DebugJourney>()
    for (const journey of journeys) {
      const key = `${journey.kind}:${journey.id}`, before = this.previous.get(key)
      if (before && (before.route.length > 1 || journey.route.length > 1) && changed(before, journey)) {
        this.changes.push({ id: ++this.sequence, time, before, after: copy(journey) })
      }
      next.set(key, copy(journey))
    }
    this.previous = next
    const kept = this.changes.find(c => c.id === pinned)
    this.changes = this.changes.slice(-100)
    if (kept && !this.changes.includes(kept)) this.changes = [kept, ...this.changes.slice(-99)]
  }

  suspend() { this.previous.clear() }
  clear() { this.previous.clear(); this.changes = [] }

  matching(selection: Selection | null, scope: "selected" | "all") {
    return this.changes.filter(({ before, after }) => scope === "all" || selection && (
      selection.kind === before.kind && selection.id === before.id ||
      selection.kind === "building" && [before.destination, after.destination].includes(selection.id)
    )).slice().reverse()
  }

  visible(selection: Selection | null, scope: "selected" | "all", seconds: number, pinned: number | null) {
    if (pinned !== null) return this.changes.filter(c => c.id === pinned)
    const seen = new Set<string>()
    return this.matching(selection, scope).filter(change => {
      const key = `${change.after.kind}:${change.after.id}`
      if (seen.has(key) || this.time - change.time > seconds) return false
      seen.add(key)
      return true
    })
  }
}
