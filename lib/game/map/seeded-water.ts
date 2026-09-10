import { BUILD_CATALOG } from "../balance"
import { buildingApproaches, buildingEntry, rotatedFootprint, rotateBuildingPoint } from "../building-rotation"
import { isComplete } from "../construction"
import { makeRng } from "../rng"
import { shrineLayout, shrinePoint } from "../shrine-layout"
import { settlementRoute } from "../settlement-route"
import { isWaterSource } from "../water-sources/navigation"
import { levelBuildingGround } from "./elevation"
import { ROUTE_EDGE_INSET } from "./route-bounds"
import { isWaterTerrain, isWoods } from "./terrain"
import { tileAt, type BuildingDef, type GameMap, type TilePos } from "./types"

export const TOWN_WATER_RADIUS = 124
export const FOUNDING_WELL_ID = "founding-well"
const CLEARING_MARGIN = 2

/** Distance to the occupied tile centres, rather than the minimum footprint corner. */
function distanceToBuilding(p: TilePos, b: BuildingDef): number {
  return Math.hypot(Math.max(b.x - p.x, p.x - (b.x + b.w - 1), 0),
    Math.max(b.z - p.z, p.z - (b.z + b.d - 1), 0))
}

/** Lakes, rivers, springs and completed wells all supply a town's water. */
export function hasNearbyWater(map: GameMap, from: TilePos, radius = TOWN_WATER_RADIUS): boolean {
  if (map.buildings.some(b => isWaterSource(b) && isComplete(b) && distanceToBuilding(from, b) <= radius)) return true
  for (let z = Math.max(0, from.z - radius); z <= Math.min(map.depth - 1, from.z + radius); z++)
    for (let x = Math.max(0, from.x - radius); x <= Math.min(map.width - 1, from.x + radius); x++) {
      if (Math.hypot(x - from.x, z - from.z) <= radius &&
        (tileAt(map, x, z) === "water" || !!map.water?.depth[z * map.width + x])) return true
    }
  return false
}

/** Try a small side clearing without covering routes, entrances, water or ancient hearts. */
function placeSource(map: GameMap, anchor: TilePos, kind: "well" | "watering-hole",
  id: string, label: string, rotationStart = 0, townId?: string, accessFrom?: TilePos, accepts = (_source: BuildingDef) => true, maxGap = 4): BuildingDef | null {
  const def = BUILD_CATALOG.find(b => b.id === kind)!
  for (let gap = 2; gap <= maxGap; gap++) for (let turn = 0; turn < 4; turn++) {
    const rotation = ((rotationStart + turn) % 4) as 0 | 1 | 2 | 3
    const outward = rotateBuildingPoint(0, -1, rotation)
    const entry = { x: anchor.x + outward.x * gap, z: anchor.z + outward.z * gap }
    const size = rotatedFootprint(def, rotation)
    const offset = buildingEntry({ ...size, x: 0, z: 0, rotation, buildType: kind })
    const source: BuildingDef = { id, label, buildType: kind, rotation, ...size,
      x: entry.x - offset.x, z: entry.z - offset.z,
      height: def.height, color: def.color, roofColor: def.roofColor,
      ...(townId || kind === "watering-hole" ? { owner: "independent" as const } : {}),
      ...(townId ? { townId } : {}) }
    if (!accepts(source)) continue
    const patch: TilePos[] = []
    for (let z = source.z - CLEARING_MARGIN; z < source.z + source.d + CLEARING_MARGIN; z++)
      for (let x = source.x - CLEARING_MARGIN; x < source.x + source.w + CLEARING_MARGIN; x++) {
        if (distanceToBuilding({ x, z }, source) <= CLEARING_MARGIN) patch.push({ x, z })
      }
    if (patch.some(p => {
      const terrain = tileAt(map, p.x, p.z)
      return Math.min(p.x, p.z, map.width - 1 - p.x, map.depth - 1 - p.z) < (accessFrom ? CLEARING_MARGIN : ROUTE_EDGE_INSET)
        || !terrain || isWaterTerrain(terrain) || terrain === "darkwood"
        || !!map.water?.depth[p.z * map.width + p.x]
        || map.buildings.some(b => distanceToBuilding(p, b) < 1)
        || map.darkForests?.some(f => f.clearing.some(q => q.x === p.x && q.z === p.z))
    })) continue
    const footprint = patch.filter(p => distanceToBuilding(p, source) === 0)
    if (footprint.some(p => ["path", "track"].includes(tileAt(map, p.x, p.z)!) ||
      map.site?.branch.some(q => q.x === p.x && q.z === p.z) ||
      map.darkForests?.some(f => f.approach.some(q => q.x === p.x && q.z === p.z)) ||
      map.buildings.some(b => buildingApproaches(map, b).some(q => q.x === p.x && q.z === p.z)))) continue
    // Springs belong off the trail, including any other trail winding past this anchor.
    if (kind === "watering-hole" && patch.some(p => distanceToBuilding(p, source) < 2 &&
      ["path", "track"].includes(tileAt(map, p.x, p.z)!))) continue
    if (map.elevation) {
      const heights = patch.map(p => map.elevation!.height[p.z * map.width + p.x])
      if (Math.max(...heights) - Math.min(...heights) >= map.elevation.settings.cliffThreshold * .7) continue
    }
    const candidate: GameMap = { ...map, tiles: [...map.tiles], buildings: [...map.buildings, source] }
    for (const p of patch) if (isWoods(candidate.tiles[p.z * map.width + p.x])) candidate.tiles[p.z * map.width + p.x] = "clearing"
    for (const p of footprint) candidate.tiles[p.z * map.width + p.x] = kind === "well" ? "grass" : "clearing"
    candidate.elevation = levelBuildingGround(candidate, source)
    const route = settlementRoute(candidate, candidate.buildings, accessFrom ?? anchor, entry, true)
    if (!route || route.length > (accessFrom ? 60 : 12) || route.some(p => {
      const terrain = tileAt(map, p.x, p.z)
      return isWaterTerrain(terrain) || terrain === "darkwood" ||
        Math.min(p.x, p.z, map.width - 1 - p.x, map.depth - 1 - p.z) < (accessFrom ? CLEARING_MARGIN : ROUTE_EDGE_INSET)
    })) continue
    for (const p of route) {
      const i = p.z * map.width + p.x
      if (kind === "well" && candidate.tiles[i] !== "path" && candidate.tiles[i] !== "track") {
        (map.buildingAccessTiles ??= []).push(p)
      }
      if (kind === "well" && candidate.tiles[i] !== "path") candidate.tiles[i] = "track"
      else if (isWoods(candidate.tiles[i])) candidate.tiles[i] = "clearing"
    }
    for (let i = 0; i < map.tiles.length; i++) map.tiles[i] = candidate.tiles[i]
    map.buildings = candidate.buildings
    map.elevation = candidate.elevation
    return source
  }
  return null
}

/** Keep the well near the enclave, beside the final stretch approaching the chapel. */
export function addLegacyFoundingWell(map: GameMap): void {
  const branch = map.site?.branch ?? []
  const preferred = Math.max(0, branch.length - 10)
  const anchors = branch.map((p, i) => ({ p, score: Math.abs(i - preferred) }))
    .sort((a, b) => a.score - b.score)
  for (const { p } of anchors) if (placeSource(map, p, "well", FOUNDING_WELL_ID, "Enclave well")) return
}

/** The water path continues past the church door and around to its rear. */
export function addFoundingWell(map: GameMap): void {
  const site = map.site, shrine = map.buildings.find(b => b.id === site?.hovelId)
  if (!site || !shrine || map.buildings.some(b => b.id === FOUNDING_WELL_ID)) return
  const { depth, rotation } = shrineLayout(shrine, site.door)
  const sin = Math.round(Math.sin(rotation)), cos = Math.round(Math.cos(rotation))
  const behind = (b: BuildingDef) => {
    for (const x of [b.x, b.x + b.w - 1]) for (const z of [b.z, b.z + b.d - 1]) {
      if ((x - shrine.x - Math.floor(shrine.w / 2)) * sin + (z - shrine.z - Math.floor(shrine.d / 2)) * cos >= -depth / 2 - 1) return false
    }
    return true
  }
  for (const maxGap of [4, 8]) for (let distance = 3; distance <= 30; distance++) for (const side of [0, -4, 4, -8, 8, -12, 12, -16, 16]) {
    const anchor = shrinePoint(shrine, site.door, side, -Math.ceil(depth / 2) - distance)
    if (placeSource(map, anchor, "well", FOUNDING_WELL_ID, "Enclave well", 0, undefined, site.door, behind, maxGap)) return
  }
}

/** Seeded chance encounters, with spacing but no regular interval or guaranteed count. */
export function addPathSprings(map: GameMap): void {
  const rng = makeRng((map.seed ?? 0) ^ 0x6d2b79f5)
  const paths = map.tiles.flatMap((t, i) => t === "path" || t === "track" ? [{ x: i % map.width, z: Math.floor(i / map.width) }] : [])
  // Shuffle so row order does not favour the northern side of the world.
  for (let i = paths.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1)); [paths[i], paths[j]] = [paths[j], paths[i]]
  }
  let count = 0
  for (const anchor of paths) {
    if (rng() >= .012 || hasNearbyWater(map, anchor, 28)) continue
    const rotation = Math.floor(rng() * 4)
    if (placeSource(map, anchor, "watering-hole", `spring-${count}`, "Woodland spring", rotation)) count++
  }
}

/** Called after natural sources are seeded, so only dry communities dig a well. */
export function addTownWells(map: GameMap): void {
  for (const town of map.towns ?? []) {
    const tavern = map.buildings.find(b => b.id === town.tavernId)!
    const entrance = buildingEntry(tavern)
    if (hasNearbyWater(map, entrance)) continue
    const road = map.road ?? []
    const anchors = road.slice(Math.max(0, town.junction - 8), town.junction + 9)
      .sort((a, b) => Math.hypot(a.x - entrance.x, a.z - entrance.z) - Math.hypot(b.x - entrance.x, b.z - entrance.z))
    for (const anchor of anchors) {
      const well = placeSource(map, anchor, "well", `${town.id}-well`, `${town.name} well`, tavern.rotation, town.id)
      if (well) { town.buildingIds.push(well.id); break }
    }
  }
}
