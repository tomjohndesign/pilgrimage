import { sheepPenLayout } from "./workshop-layout"
import { buildingEntry, buildingFoldEntry, rotatedFootprint, rotateBuildingPoint } from "./building-rotation"
import { marketYardContains } from "./market-layout"
import { isComplete, isEnterable } from "./construction"
import { shrineLayout, shrineKneelers } from "./shrine-layout"
import type { BuildingDef, GameMap, TilePos } from "./map/types"

export function containsTile(building: BuildingDef, p: TilePos): boolean {
  return p.x >= building.x - .5 && p.x < building.x + building.w - .5 && p.z >= building.z - .5 && p.z < building.z + building.d - .5
}

/** The only gate faces the founding approach; +Z is the standalone default. */
export function shrineGates(building: BuildingDef, door?: TilePos): Array<{ outside: TilePos; inside: TilePos }> {
  const x = building.x + Math.floor(building.w / 2), z = building.z + Math.floor(building.d / 2)
  const gates = [
    { outside: { x, z: building.z - 1 }, inside: { x, z: building.z } },
    { outside: { x, z: building.z + building.d }, inside: { x, z: building.z + building.d - 1 } },
    { outside: { x: building.x - 1, z }, inside: { x: building.x, z } },
    { outside: { x: building.x + building.w, z }, inside: { x: building.x + building.w - 1, z } },
  ]
  return [door ? gates.find(g => g.outside.x === door.x && g.outside.z === door.z) ?? gates[1] : gates[1]]
}

/** Test the whole walking segment against furniture, with room for the body. */
export function shrineFurnitureClear(building: BuildingDef, door: TilePos | undefined, from: TilePos, to: TilePos, seat?: string): boolean {
  const layout = shrineLayout(building, door)
  const sin = Math.round(Math.sin(layout.rotation)), cos = Math.round(Math.cos(layout.rotation))
  const local = (p: TilePos) => {
    const x = p.x - building.x - Math.floor(building.w / 2), z = p.z - building.z - Math.floor(building.d / 2)
    return { x: x * cos - z * sin, z: x * sin + z * cos }
  }
  const a = local(from), b = local(to), clearance = .1
  const obstacles = [
    { id: "altar", x: 0, z: layout.altarZ, width: Math.min(.72, layout.width * .43), depth: Math.min(.46, layout.depth * .4) },
    ...shrineKneelers(layout.width, layout.depth).map(p => ({ ...p, z: p.z - .1, width: p.length, depth: .48, placeZ: p.z })),
  ]
  return obstacles.every(p => {
    // Only a visitor's reserved seat can be entered, as the final approach.
    if (p.id === seat && "placeZ" in p && [a, b].some(point => point.x === p.x && point.z === p.placeZ)) return true
    let low = 0, high = 1
    for (const axis of ["x", "z"] as const) {
      const half = (axis === "x" ? p.width : p.depth) / 2 + clearance
      const delta = b[axis] - a[axis], start = a[axis] - p[axis]
      if (Math.abs(delta) < 1e-8) {
        if (Math.abs(start) > half) return true
      } else {
        const u = (-half - start) / delta, v = (half - start) / delta
        low = Math.max(low, Math.min(u, v)); high = Math.min(high, Math.max(u, v))
        if (low > high) return true
      }
    }
    return false
  })
}

/** Closed buildings block walking. Shrine visits cross walls only at a gate. */
export function buildingStepAllowed(map: GameMap, buildings: readonly BuildingDef[], from: TilePos, to: TilePos, enterShrine = false, seat?: string): boolean {
  for (const building of buildings) {
    const a = containsTile(building, from) && !marketYardContains(building, from), b = containsTile(building, to) && !marketYardContains(building, to)
    if (!a && !b) continue
    if (enterShrine && isEnterable(building) && isComplete(building)) {
      if (building.buildType === "sheep-pen") {
        const local = rotatedFootprint(building, building.rotation)
        const inHut = (p: TilePos) => rotateBuildingPoint(p.x - building.x - (building.w - 1) / 2,
          p.z - building.z - (building.d - 1) / 2, -(building.rotation ?? 0)).x < sheepPenLayout(local.w).penLeft
        if (a && b) { if (inHut(from) !== inHut(to)) return false; continue }
        const inside = a ? from : to, outside = a ? to : from
        if (!inHut(inside)) {
          const entry = buildingFoldEntry(building), inward = buildingFoldEntry(building, true)
          if (inside.x === inward.x && inside.z === inward.z && outside.x === entry.x && outside.z === entry.z) continue
          return false
        }
      }
      if (a && b) continue
      const inside = a ? from : to, outside = a ? to : from
      // Cross the wall only in a doorway; the tavern also keeps a back door.
      const doors = building.buildType === "tavern" ? ([1, -1] as const) : ([1] as const)
      if (doors.some(end => {
        const entry = buildingEntry(building, false, end), inward = buildingEntry(building, true, end)
        return inside.x === inward.x && inside.z === inward.z && outside.x === entry.x && outside.z === entry.z
      })) continue
      return false
    }
    if (!enterShrine || building.id !== map.site?.hovelId) return false
    if (!shrineFurnitureClear(building, map.site?.door, from, to, seat)) return false
    // Leave the relic table clear.
    const { altarTile: altar } = shrineLayout(building, map.site?.door)
    const cx = altar.x, cz = altar.z
    if (to.x === cx && to.z === cz) return false
    if (a && b) continue
    const onPassage = (p: TilePos, gate: { inside: TilePos; outside: TilePos }) =>
      p.x >= Math.min(gate.inside.x, gate.outside.x) && p.x <= Math.max(gate.inside.x, gate.outside.x)
      && p.z >= Math.min(gate.inside.z, gate.outside.z) && p.z <= Math.max(gate.inside.z, gate.outside.z)
    if (!shrineGates(building, map.site?.door).some(g => onPassage(from, g) && onPassage(to, g))) return false
  }
  return true
}
