import type { BuildingDef, GameMap } from "../map/types"
import { roundRoute, routeLength, routePoint } from "../transport/roadside"
import { shrineLayout } from "../shrine-layout"

/** A fixed preview of the founding chapel, independent of the player's map seed. */
export const LANDING_CHAPEL: BuildingDef = {
  id: "landing-chapel", label: "Relic chapel", x: -1, z: -1, w: 2, d: 2,
  height: .9, color: "#e7d8b9", roofColor: "#c4a05f",
}

/** Tile coordinates name the first occupied cell; models render at the footprint centre. */
export const LANDING_CHAPEL_CENTER = {
  x: LANDING_CHAPEL.x + (LANDING_CHAPEL.w - 1) / 2,
  z: LANDING_CHAPEL.z + (LANDING_CHAPEL.d - 1) / 2,
}

/** Stable identities keep the preview walkers selectable throughout their route. */
export const LANDING_MONKS = [{ id: 0, age: 30 }, { id: 1, age: 65 }, { id: 2, age: 30 }] as const

const corners = [{ x: 0, z: 3 }, { x: 3, z: 3 }, { x: 3, z: -3 },
  { x: -3, z: -3 }, { x: -3, z: 3 }, { x: 0, z: 3 }]
export const LANDING_MONK_ROUTE = roundRoute(corners)
export const LANDING_ROUTE_LENGTH = routeLength(LANDING_MONK_ROUTE)

/** The drawn paths and walking route share tile centres, including the chapel approach. */
export const LANDING_TILES = Array.from({ length: 121 }, (_, i) => ({ x: i % 11 - 5, z: Math.floor(i / 11) - 5 }))
  .filter(tile => Math.hypot(tile.x, tile.z) <= 5.5)
  .map(tile => ({ ...tile,
    path: (Math.abs(tile.x) === 3 && Math.abs(tile.z) <= 3)
      || (Math.abs(tile.z) === 3 && Math.abs(tile.x) <= 3)
      || (tile.x === 0 && tile.z >= 1),
    // Keep the outer grass readable, with only a gentle fade around the patch.
    opacity: .5 + .5 * Math.max(.18, Math.min(1, (6 - Math.hypot(tile.x, tile.z)) / 1.7)),
  }))

/** Only decorative terrain data: no generated player map or simulation state. */
export const LANDING_TERRAIN: GameMap = {
  width: 11, depth: 11, seed: 7,
  tiles: Array.from({ length: 121 }, (_, i) => LANDING_TILES.some(tile => tile.path && tile.x === i % 11 - 5 && tile.z === Math.floor(i / 11) - 5) ? "track" : "grass"),
  buildings: [{ ...LANDING_CHAPEL, x: LANDING_CHAPEL.x + 5, z: LANDING_CHAPEL.z + 5 }],
  site: { junction: 0, branch: [{ x: 5, z: 10 }, { x: 5, z: 9 }, { x: 5, z: 8 }, { x: 5, z: 7 }, { x: 5, z: 6 }], door: { x: 5, z: 6 }, hovelId: LANDING_CHAPEL.id },
}

export const LANDING_CHAPEL_LAYOUT = shrineLayout(LANDING_TERRAIN.buildings[0], LANDING_TERRAIN.site?.door)

export function landingMonkPoint(distance: number) {
  return routePoint(LANDING_MONK_ROUTE, ((distance % LANDING_ROUTE_LENGTH) + LANDING_ROUTE_LENGTH) % LANDING_ROUTE_LENGTH)
}
