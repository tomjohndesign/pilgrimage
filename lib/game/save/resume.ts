import { elevationSettings, type ElevationSettings } from "../map/elevation"
import type { GameSave } from "./schema"
import { sameWorldSettings, WORLD_SETTING_KEYS, type WorldSettings } from "./settings"

/**
 * Whether a link opens the saved world. A bare `/play` resumes it; a link that
 * names a seed or any generation input resumes only when they all agree with
 * the save, otherwise it is a request for a different land.
 */
export function saveResumesQuery(save: GameSave, seed: number | undefined, world: Partial<WorldSettings>): boolean {
  if (seed !== undefined && (seed >>> 0) !== save.world.seed) return false
  for (const key of WORLD_SETTING_KEYS) {
    if (key === "elevation") continue
    const wanted = world[key]
    if (wanted !== undefined && wanted !== save.world[key]) return false
  }
  if (world.elevation) {
    const wanted = elevationSettings(world.elevation)
    for (const key of Object.keys(wanted) as (keyof ElevationSettings)[]) {
      if (wanted[key] !== save.world.elevation[key]) return false
    }
  }
  return true
}

/** Whether the save describes the world the shell is about to generate. */
export function saveMatchesWorld(save: GameSave, seed: number | null, settings: WorldSettings): boolean {
  return seed !== null && (seed >>> 0) === save.world.seed && sameWorldSettings(save.world, settings)
}
