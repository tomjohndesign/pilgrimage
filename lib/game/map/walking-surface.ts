import { isComplete } from "../construction"
import { shrineLayout, shrineAltarRise, shrineChancelFront, isChapel } from "../shrine-layout"
import { FORD_DEPTH } from "./fords"
import { BRIDGE_RISE, bridgeLayout, bridgeCornerAt, ropeDeckHeight } from "./bridges"
import { groundHeight } from "./elevation"
import { TILE_HEIGHT } from "./terrain"
import type { GameMap } from "./types"

function createShrineFloor(map: GameMap) {
  const shrine = map.site && map.buildings.find(b => b.id === map.site!.hovelId)
  if (!shrine || !isComplete(shrine) || isChapel(shrine)) return null
  const shape = shrineLayout(shrine, map.site!.door), cx = shrine.x + (shrine.w - 1) / 2, cz = shrine.z + (shrine.d - 1) / 2
  return { cx, cz, minX: shrine.x - .5, maxX: shrine.x + shrine.w - .5, minZ: shrine.z - .5, maxZ: shrine.z + shrine.d - .5,
    cos: Math.round(Math.cos(shape.rotation)), sin: Math.round(Math.sin(shape.rotation)), halfWidth: shape.width / 2 - .13,
    rear: -shape.depth / 2 + .13, front: shrineChancelFront(shape.depth), rise: shrineAltarRise(shape.depth), ground: groundHeight(map, cx, cz) }
}
const shrineFloors = new WeakMap<GameMap, ReturnType<typeof createShrineFloor>>()
function shrineFloor(map: GameMap) {
  if (!shrineFloors.has(map)) shrineFloors.set(map, createShrineFloor(map))
  return shrineFloors.get(map)!
}

/** Height and grade of the rendered triangle/deck, sampled in centred world coordinates. */
export function walkingSurface(map: GameMap, wx: number, wz: number) {
  if (bridgeCornerAt(map, wx, wz)) return { height: TILE_HEIGHT + BRIDGE_RISE, dx: 0, dz: 0 }
  const x = wx + map.width / 2 - 0.5, z = wz + map.depth / 2 - 0.5
  const floor = shrineFloor(map)
  if (floor && x >= floor.minX && x < floor.maxX && z >= floor.minZ && z < floor.maxZ) {
    const localX = (x - floor.cx) * floor.cos - (z - floor.cz) * floor.sin
    const localZ = (x - floor.cx) * floor.sin + (z - floor.cz) * floor.cos
    if (Math.abs(localX) <= floor.halfWidth && localZ >= floor.rear && localZ <= floor.front + .16)
      return { height: floor.ground + floor.rise * (localZ <= floor.front ? 1 : .5), dx: 0, dz: 0 }
  }
  const tx = Math.max(0, Math.min(map.width - 1, Math.floor(x + 0.5)))
  const tz = Math.max(0, Math.min(map.depth - 1, Math.floor(z + 0.5)))
  const index = tz * map.width + tx, layout = bridgeLayout(map)
  if (map.tiles[index] === "ford") return { height: TILE_HEIGHT + (map.water?.surface?.[index] ?? 0) - FORD_DEPTH, dx: 0, dz: 0 }
  const span = layout.ropeAt.get(index)
  if (span) {
    const first = span.tiles[0], last = span.tiles[span.tiles.length - 1]
    const along = (x - (first.x + last.x) / 2) * span.dx + (z - (first.z + last.z) / 2) * span.dz
    const grade = 8 * (span.ropeSag ?? 0) * along / span.tiles.length ** 2
    return { height: ropeDeckHeight(span, along), dx: grade * span.dx, dz: grade * span.dz }
  }
  const rise = layout.rise[index]
  if (rise > 0) {
    const ramp = layout.rampsAt.get(index)
    const dx = ramp ? BRIDGE_RISE * ramp.dx : 0, dz = ramp ? BRIDGE_RISE * ramp.dz : 0
    return { height: TILE_HEIGHT + rise + (x - tx) * dx + (z - tz) * dz, dx, dz }
  }
  if (!map.elevation) return { height: TILE_HEIGHT, dx: 0, dz: 0 }
  const c = map.elevation.corners, i = index * 4
  const first = x - tx + z - tz <= 0
  return {
    height: groundHeight(map, x, z),
    dx: first ? c[i + 1] - c[i] : c[i + 3] - c[i + 2],
    dz: first ? c[i + 2] - c[i] : c[i + 3] - c[i + 1],
  }
}
