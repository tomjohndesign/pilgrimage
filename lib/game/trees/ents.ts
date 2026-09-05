import { TERRAIN } from "../map/terrain"
import { tileAt, worldToTileX, worldToTileZ, type GameMap } from "../map/types"
import { deriveSeed, makeRng, SEED_STREAM } from "../rng"
import type { TreePlacement } from "./placement"

export const ENT_CHANCE = 0.01
export const ENT_REST_SECONDS = 60
export const ENT_WALK_SECONDS = 30
export const ENT_RISE_SECONDS = 3
export const ENT_LEG_HEIGHT = 0.65

export interface EntState {
  x: number
  z: number
  fromX: number
  fromZ: number
  targetX: number
  targetZ: number
  lift: number
  heading: number
  phase: "rooted" | "rising" | "walking" | "planting"
  elapsed: number
  wait: number
  rng: () => number
}

/** Stable one-in-a-hundred eligibility, separate from tree shapes and placement. */
export function createEnt(placement: TreePlacement, seed: number, index: number): EntState | undefined {
  const rng = makeRng(deriveSeed(deriveSeed(seed, SEED_STREAM.ents), index))
  if (rng() >= ENT_CHANCE) return undefined
  return {
    x: placement.x, z: placement.z,
    fromX: placement.x, fromZ: placement.z,
    targetX: placement.x, targetZ: placement.z,
    lift: 0, heading: 0, phase: "rooted", elapsed: 0,
    // Stagger the first walks across a minute so the forest never marches in sync.
    wait: ENT_REST_SECONDS * rng(), rng,
  }
}

function clearRoute(map: GameMap, x: number, z: number, targetX: number, targetZ: number): boolean {
  // Check the whole short walk, so an ent cannot cross water or a building.
  const steps = Math.ceil(Math.hypot(targetX - x, targetZ - z) * 4)
  for (let i = 0; i <= steps; i++) {
    const tx = worldToTileX(map, x + (targetX - x) * i / steps)
    const tz = worldToTileZ(map, z + (targetZ - z) * i / steps)
    const terrain = tileAt(map, tx, tz)
    if (!terrain || (!TERRAIN[terrain].passable && terrain !== "forest" && terrain !== "darkwood")) return false
    if (terrain === "path" || terrain === "track" || terrain === "bridge") return false
    if (map.buildings.some((b) => tx >= b.x - 1 && tx < b.x + b.w + 1 && tz >= b.z - 1 && tz < b.z + b.d + 1)) return false
  }
  return true
}

/** A thirty-second stroll followed by one minute planted before the next walk. */
export function stepEnt(ent: EntState, map: GameMap, delta: number): void {
  const dt = Math.max(0, Math.min(delta, 0.1))
  if (ent.phase === "rooted") {
    ent.wait -= dt
    if (ent.wait > 0) return
    ent.wait = ENT_REST_SECONDS
    for (let attempt = 0; attempt < 12; attempt++) {
      const heading = ent.rng() * Math.PI * 2
      const distance = 2 + ent.rng() * 2
      const x = ent.x + Math.sin(heading) * distance
      const z = ent.z + Math.cos(heading) * distance
      if (!clearRoute(map, ent.x, ent.z, x, z)) continue
      ent.fromX = ent.x
      ent.fromZ = ent.z
      ent.targetX = x
      ent.targetZ = z
      ent.heading = heading
      ent.phase = "rising"
      ent.elapsed = 0
      return
    }
    return
  }

  ent.elapsed += dt
  if (ent.phase === "rising") {
    ent.lift = Math.min(1, ent.elapsed / ENT_RISE_SECONDS) * ENT_LEG_HEIGHT
    if (ent.elapsed >= ENT_RISE_SECONDS) { ent.phase = "walking"; ent.elapsed = 0 }
  } else if (ent.phase === "walking") {
    const progress = Math.min(1, ent.elapsed / ENT_WALK_SECONDS)
    ent.x = ent.fromX + (ent.targetX - ent.fromX) * progress
    ent.z = ent.fromZ + (ent.targetZ - ent.fromZ) * progress
    ent.lift = ENT_LEG_HEIGHT + Math.sin(progress * Math.PI * 20) * 0.035
    if (ent.elapsed >= ENT_WALK_SECONDS) { ent.phase = "planting"; ent.elapsed = 0; ent.lift = ENT_LEG_HEIGHT }
  } else {
    ent.lift = Math.max(0, 1 - ent.elapsed / ENT_RISE_SECONDS) * ENT_LEG_HEIGHT
    if (ent.elapsed >= ENT_RISE_SECONDS) {
      ent.phase = "rooted"
      ent.elapsed = 0
      ent.wait = ENT_REST_SECONDS
    }
  }
}
