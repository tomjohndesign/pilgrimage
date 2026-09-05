import { bridgeLayout } from "../map/bridges"
import { computeForestShade } from "../map/forest-field"
import { TILE_HEIGHT, type TerrainId } from "../map/terrain"
import { worldToTileX, worldToTileZ, type GameMap } from "../map/types"
import { deriveSeed, makeRng, SEED_STREAM } from "../rng"
import { ELEMENT_RADIUS, ENVIRONMENT_KINDS, type EnvironmentKind, type EnvironmentPlacement } from "./elements"

/** Relative habitat weights, in ENVIRONMENT_KINDS order. */
const HABITATS: Partial<Record<TerrainId, readonly number[]>> = {
  grass: [16, 44, 9, 5, 14, 12],
  clearing: [12, 44, 5, 2, 21, 16],
  hills: [8, 21, 31, 28, 7, 5],
  dirt: [4, 12, 61, 19, 4, 0],
  sand: [0, 5, 76, 19, 0, 0],
}

const CELL_SIZE = 6
const SOFT = new Set<EnvironmentKind>(["grass", "groundcover", "wildflowers"])

/** Ground growth can interleave within a patch; solid stones and shrubs need room. */
export function environmentSpacing(a: EnvironmentPlacement, b: EnvironmentPlacement): number {
  const radii = ELEMENT_RADIUS * (a.scale + b.scale)
  if (a.cluster !== undefined && a.cluster === b.cluster) {
    return SOFT.has(a.kind) && SOFT.has(b.kind) ? radii * 0.48 : radii + 0.06
  }
  return radii + 0.5
}

/**
 * Loose, elongated colonies rather than a separate roll on every tile. Each
 * six-tile cell can seed one family: meadow growth spreads across several tiles,
 * shrubs form thickets, and outcrops gather a few boulders with smaller stones.
 * Random centers, yaw, size, and gaps hide the sampling grid. Most ground stays
 * empty between colonies. Every member checks its whole footprint against land,
 * roads, water, building aprons and bridge approaches, even across tile edges.
 */
export function placeEnvironment(map: GameMap): EnvironmentPlacement[] {
  const seed = deriveSeed(map.seed ?? 0, SEED_STREAM.environment)
  const shapeSeed = deriveSeed(map.seed ?? 0, SEED_STREAM.environmentShapes)
  const shade = computeForestShade(map)
  const rise = bridgeLayout(map).rise
  const blocked = new Set<number>()
  for (const b of map.buildings) {
    for (let z = Math.max(0, b.z - 1); z < Math.min(map.depth, b.z + b.d + 1); z++) {
      for (let x = Math.max(0, b.x - 1); x < Math.min(map.width, b.x + b.w + 1); x++) {
        blocked.add(z * map.width + x)
      }
    }
  }
  if (map.site) blocked.add(map.site.door.z * map.width + map.site.door.x)

  const onLand = (px: number, pz: number, radius: number, kind: EnvironmentKind) => {
    const kindIndex = ENVIRONMENT_KINDS.indexOf(kind)
    for (let z = worldToTileZ(map, pz - radius); z <= worldToTileZ(map, pz + radius); z++) {
      for (let x = worldToTileX(map, px - radius); x <= worldToTileX(map, px + radius); x++) {
        if (x < 0 || z < 0 || x >= map.width || z >= map.depth) return false
        const i = z * map.width + x
        if (!HABITATS[map.tiles[i]]?.[kindIndex] || blocked.has(i) || rise[i] > 0) return false
      }
    }
    return true
  }

  const out: EnvironmentPlacement[] = []
  const byTile = new Map<number, EnvironmentPlacement[]>()
  const columns = Math.ceil(map.width / CELL_SIZE)
  for (let cz = 0; cz < Math.ceil(map.depth / CELL_SIZE); cz++) {
    for (let cx = 0; cx < columns; cx++) {
      const cluster = cz * columns + cx
      const rng = makeRng(deriveSeed(seed, cluster))
      // Empty cells preserve broad quiet areas, even on a completely bare map.
      if (rng() > 0.72) continue
      const tx = cx * CELL_SIZE + 1 + rng() * (CELL_SIZE - 2)
      const tz = cz * CELL_SIZE + 1 + rng() * (CELL_SIZE - 2)
      if (tx >= map.width || tz >= map.depth) continue
      const index = Math.floor(tz) * map.width + Math.floor(tx)
      const weights = HABITATS[map.tiles[index]]
      if (!weights || blocked.has(index) || rise[index] > 0) continue
      if (map.tiles[index] === "clearing" && rng() < 0.25) continue
      const habitat = [...weights]
      if (habitat[0] > 0) habitat[0] += shade[index] * 65
      let pick = rng() * habitat.reduce((sum, n) => sum + n, 0)
      let family: EnvironmentKind = "grass"
      for (let i = 0; i < habitat.length; i++) {
        pick -= habitat[i]
        if (pick < 0) { family = ENVIRONMENT_KINDS[i]; break }
      }

      const meadow = SOFT.has(family)
      const solitary = family === "boulder" && rng() < 0.28
      const count = meadow ? 16 + Math.floor(rng() * 15)
        : solitary ? 1 : family === "boulder" ? 3 + Math.floor(rng() * 3) : 4 + Math.floor(rng() * 5)
      const major = meadow ? 1.6 + rng() * 1.2 : 0.9 + rng() * 0.8
      const minor = major * (0.45 + rng() * 0.25)
      const yaw = rng() * Math.PI * 2
      const centerX = tx - map.width / 2
      const centerZ = tz - map.depth / 2

      for (let member = 0; member < count; member++) {
        let kind = family
        // Keep the dominant family legible, with a few companions at its feet.
        if (member > 1) {
          const companion = rng()
          if (family === "grass" && companion < 0.13) kind = "wildflowers"
          else if (family === "wildflowers" && companion < 0.6) kind = "grass"
          else if (family === "boulder" && member > 2 && companion < 0.65) kind = "rocks"
          else if (family === "bush" && companion < 0.25) kind = "groundcover"
        }
        const scale = kind === "boulder" ? 0.7 + rng() * 0.6 : 0.7 + rng() * 0.3
        const radius = ELEMENT_RADIUS * scale
        for (let attempt = 0; attempt < 8; attempt++) {
          const angle = rng() * Math.PI * 2
          const distance = member === 0 ? 0 : Math.sqrt(rng())
          const u = Math.cos(angle) * distance * major
          const v = Math.sin(angle) * distance * minor
          const px = centerX + u * Math.cos(yaw) - v * Math.sin(yaw)
          const pz = centerZ + u * Math.sin(yaw) + v * Math.cos(yaw)
          if (!onLand(px, pz, radius, kind)) continue
          const x = worldToTileX(map, px)
          const z = worldToTileZ(map, pz)
          const placement: EnvironmentPlacement = {
            x: px, y: TILE_HEIGHT, z: pz, kind, scale, cluster,
            yaw: rng() * Math.PI * 2,
            brightness: 1 - shade[z * map.width + x] * 0.25,
            seed: deriveSeed(deriveSeed(shapeSeed, cluster), member),
          }
          let crowded = false
          // Largest solid pair plus inter-colony gap is < 2 world units.
          for (let dz = -2; dz <= 2 && !crowded; dz++) {
            for (let dx = -2; dx <= 2 && !crowded; dx++) {
              const nx = x + dx
              const nz = z + dz
              if (nx < 0 || nz < 0 || nx >= map.width || nz >= map.depth) continue
              for (const other of byTile.get(nz * map.width + nx) ?? []) {
                if (Math.hypot(other.x - px, other.z - pz) < environmentSpacing(placement, other)) {
                  crowded = true
                  break
                }
              }
            }
          }
          if (crowded) continue
          const key = z * map.width + x
          const here = byTile.get(key) ?? []
          here.push(placement)
          byTile.set(key, here)
          out.push(placement)
          break
        }
      }
    }
  }
  return out
}
