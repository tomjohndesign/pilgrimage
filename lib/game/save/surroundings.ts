import { environmentRadius, type BoulderSize, type EnvironmentKind, type EnvironmentPlacement } from "../environment/elements"
import { placeEnvironment } from "../environment/placement"
import { isGroundGrowth } from "../environment/sprites"
import { DEFAULT_ELEVATION, groundHeight } from "../map/elevation"
import type { TerrainId } from "../map/terrain"
import { tileToWorldX, tileToWorldZ, worldToTileX, worldToTileZ, type GameMap } from "../map/types"
import type { TreePlacement } from "../trees/placement"
import type { SurroundingsSave } from "./schema"

/** Tiles each way from the camera focus that the save remembers; the same disc as the landing church. */
export const SURROUNDINGS_RADIUS = 5

/**
 * A small memory of the land around the camera. Regenerating the world takes
 * a moment; while it does, the loading overlay draws these tiles, trees and
 * scenery with the game's own renderer where the real ones will appear, so a
 * reload picks up the view the player left.
 *
 * Positions are relative to the camera focus, which is where the overlay's
 * scene puts its origin, so the patch lines up whatever the map size.
 */
export function captureSurroundings(map: GameMap, targetX: number, targetZ: number,
  trees: readonly TreePlacement[] = [], felled: ReadonlySet<number> = new Set(), radius = SURROUNDINGS_RADIUS): SurroundingsSave {
  const x = worldToTileX(map, targetX), z = worldToTileZ(map, targetZ)
  const terrain: Array<TerrainId | null> = []
  const height: number[] = []
  const corners: number[] = []
  for (let dz = -radius; dz <= radius; dz++) for (let dx = -radius; dx <= radius; dx++) {
    const tx = x + dx, tz = z + dz
    if (tx < 0 || tz < 0 || tx >= map.width || tz >= map.depth) {
      terrain.push(null)
      height.push(0)
      corners.push(0, 0, 0, 0)
      continue
    }
    const index = tz * map.width + tx
    terrain.push(map.tiles[index])
    height.push(map.elevation?.height[index] ?? 0)
    for (let corner = 0; corner < 4; corner++) corners.push(map.elevation?.corners[index * 4 + corner] ?? 0)
  }
  const reach = radius + .5
  const inside = (wx: number, wz: number) => Math.abs(wx - targetX) <= reach && Math.abs(wz - targetZ) <= reach
  return {
    x, z,
    offsetX: tileToWorldX(map, x) - targetX,
    offsetZ: tileToWorldZ(map, z) - targetZ,
    radius, terrain, height, corners,
    trees: trees.flatMap((tree, index) => felled.has(index) || !inside(tree.x, tree.z) ? [] : [{
      x: tree.x - targetX, y: tree.y, z: tree.z - targetZ, species: tree.species,
      brightness: tree.brightness, oldGrowth: tree.oldGrowth, dead: tree.dead,
    }]),
    scenery: visibleScenery(map).flatMap(p => !inside(p.x, p.z) ? [] : [{
      x: p.x - targetX, y: p.y, z: p.z - targetZ, kind: p.kind, scale: p.scale, yaw: p.yaw,
      brightness: p.brightness, seed: p.seed, boulderSize: p.boulderSize, cluster: p.cluster,
    }]),
  }
}

/** Scenery placement is deterministic per map and costly; keep it for repeated autosaves. */
const sceneryCache = new WeakMap<GameMap["tiles"], EnvironmentPlacement[]>()

/** The scenery the game draws: no ground growth, nothing under a building apron, on the ground. */
function visibleScenery(map: GameMap): EnvironmentPlacement[] {
  let placements = sceneryCache.get(map.tiles)
  if (!placements) {
    placements = placeEnvironment(map)
    sceneryCache.set(map.tiles, placements)
  }
  return placements.flatMap(p => {
    if (isGroundGrowth(p.kind)) return []
    const radius = environmentRadius(p)
    const x = p.x + map.width / 2, z = p.z + map.depth / 2
    if (map.buildings.some(b => x + radius > b.x - 1 && x - radius < b.x + b.w + 1 && z + radius > b.z - 1 && z - radius < b.z + b.d + 1)) return []
    return [{ ...p, y: groundHeight(map, x - .5, z - .5) }]
  })
}

/**
 * The patch as a small map of its own, centred on the tile under the camera.
 * Every tile is a box from the map's floor to its top, and a box shows its
 * sides wherever no neighbour hides them. A ring of copied tiles around the
 * patch, drawn at zero coverage, hides the rim's sides the way the real map's
 * neighbours do, so the disc ends in ground rather than earth walls.
 */
export function surroundingsMap(patch: SurroundingsSave): GameMap {
  const span = 2 * patch.radius + 1, width = span + 2
  const tiles: TerrainId[] = [], height: number[] = [], corners: number[] = []
  for (let z = 0; z < width; z++) for (let x = 0; x < width; x++) {
    const source = clampIndex(z, span) * span + clampIndex(x, span)
    tiles.push((patch.terrain[source] ?? "grass") as TerrainId)
    height.push(patch.height[source])
    corners.push(...patch.corners.slice(source * 4, source * 4 + 4))
  }
  return {
    width, depth: width, seed: 0, buildings: [], tiles,
    elevation: { settings: DEFAULT_ELEVATION, height, corners, slope: new Array(width * width).fill(0), cliffs: new Array(width * width).fill(0) },
  }
}

/** Map column or row to the patch tile it copies: the ring repeats the rim. */
function clampIndex(value: number, span: number): number {
  return Math.max(0, Math.min(span - 1, value - 1))
}

/** Per-tile red-channel opacity: a disc fading at its rim, like the landing church's ground. */
export function surroundingsCoverage(patch: SurroundingsSave): Uint8Array {
  const span = 2 * patch.radius + 1, width = span + 2
  const data = new Uint8Array(width * width * 4)
  patch.terrain.forEach((id, index) => {
    if (id === null) return
    const dx = index % span - patch.radius, dz = Math.floor(index / span) - patch.radius
    const distance = Math.hypot(dx, dz)
    if (distance > 5.5) return
    data[((dz + patch.radius + 1) * width + dx + patch.radius + 1) * 4] = Math.round(Math.max(.18, Math.min(1, (6 - distance) / 1.7)) * 255)
  })
  return data
}

/** Trees in the patch map's own coordinates, whose origin is the centre tile. */
export function surroundingsTrees(patch: SurroundingsSave): TreePlacement[] {
  return patch.trees.map(tree => ({
    x: tree.x - patch.offsetX, y: tree.y, z: tree.z - patch.offsetZ,
    species: tree.species as TreePlacement["species"], brightness: tree.brightness, oldGrowth: tree.oldGrowth, dead: tree.dead,
  }))
}

export function surroundingsScenery(patch: SurroundingsSave): EnvironmentPlacement[] {
  return patch.scenery.map(p => ({
    x: p.x - patch.offsetX, y: p.y, z: p.z - patch.offsetZ, kind: p.kind as EnvironmentKind, scale: p.scale, yaw: p.yaw,
    brightness: p.brightness, seed: p.seed, boulderSize: p.boulderSize as BoulderSize | undefined, cluster: p.cluster,
  }))
}
