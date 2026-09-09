import { rotateBuildingPoint, rotatedFootprint } from "../building-rotation"
import { isComplete } from "../construction"
import { groundHeight } from "../map/elevation"
import type { BuildingDef, GameMap } from "../map/types"
import { roofProfile, singlePlaneRoofRise } from "./dimensions"
import { layoutHand } from "../building-layout"
import { hasDomesticHearth, shelterHearth } from "./furnishings"
import type { SharedChimney } from "./shared-chimney"

/** A shared side edge, expressed in the building's unrotated local frame. */
export interface RoofJoin {
  neighborId: string
  side: -1 | 1
  from: number
  to: number
  /** Absolute roof heights relative to this building's ground. */
  heights: [number, number][]
  chimney?: SharedChimney
}

export function joinedRoofHeight(join: RoofJoin, z: number): number {
  const next = join.heights.findIndex(point => point[0] >= z)
  if (next <= 0) return join.heights[next < 0 ? join.heights.length - 1 : 0][1]
  const [a, b] = [join.heights[next - 1], join.heights[next]]
  return a[1] + (b[1] - a[1]) * (z - a[0]) / (b[0] - a[0])
}

/** Join touching domestic shells with compatible pitches and foundations.
 * Index tile edges, so adding homes does not require an all-pairs map scan.
 * Doors remain independent; the shrine and unfinished shells keep their own roofs.
 */
export function buildingRoofJoins(map: GameMap, riseFor = (building: BuildingDef) => singlePlaneRoofRise(rotatedFootprint(building, building.rotation).d)): Map<string, RoofJoin[]> {
  const result = new Map<string, RoofJoin[]>()
  type Edge = { building: BuildingDef; side: -1 | 1 }
  const edges = new Map<string, Edge[]>()
  const seen = new Set<string>()
  for (const building of map.buildings) {
    if (building.id === map.site?.hovelId || !isComplete(building)
      || !["house", "hall", "tavern"].includes(building.buildType ?? "")) continue
    const local = rotatedFootprint(building, building.rotation)
    for (const side of [-1, 1] as const) {
      const at = (z: number) => {
        const p = rotateBuildingPoint(side * local.w / 2, z, building.rotation)
        return { x: building.x + building.w / 2 + p.x, z: building.z + building.d / 2 + p.z }
      }
      const a = at(-local.d / 2), b = at(local.d / 2), vertical = a.x === b.x
      const fixed = vertical ? a.x : a.z
      for (let unit = Math.min(vertical ? a.z : a.x, vertical ? b.z : b.x);
        unit < Math.max(vertical ? a.z : a.x, vertical ? b.z : b.x); unit++) {
        const key = `${vertical ? "x" : "z"}:${fixed}:${unit}`, others = edges.get(key) ?? []
        for (const other of others) {
          const pair = [building.id, other.building.id].sort().join("\0")
          if (seen.has(pair)) continue
          seen.add(pair)
          connect(building, side, other.building, other.side)
        }
        others.push({ building, side }); edges.set(key, others)
      }
    }
  }
  // Only fireplaces facing the same party wall can feed a compact common stack.
  const byId = new Map(map.buildings.map(b => [b.id, b]))
  const paired = new Set<string>()
  for (const [id, joins] of result) for (const join of joins) {
    if (paired.has(id) || paired.has(join.neighborId)) continue
    const a=byId.get(id)!, b=byId.get(join.neighborId)!
    if (!hasDomesticHearth(a.buildType,a.layoutSeed,a.fireplace) || !hasDomesticHearth(b.buildType,b.layoutSeed,b.fireplace)) continue
    const la=rotatedFootprint(a,a.rotation), lb=rotatedFootprint(b,b.rotation)
    const ah=shelterHearth(la.w,la.d,a.height,riseFor(a),a.layoutSeed,a.hearthZ), bh=shelterHearth(lb.w,lb.d,b.height,riseFor(b),b.layoutSeed,b.hearthZ)
    ah.x*=layoutHand(a.buildType,a.layoutSeed); bh.x*=layoutHand(b.buildType,b.layoutSeed)
    const relative = (x: number, z: number, from: BuildingDef, to: BuildingDef) => {
      const p=rotateBuildingPoint(x,z,from.rotation)
      return rotateBuildingPoint(p.x+from.x+from.w/2-to.x-to.w/2,p.z+from.z+from.d/2-to.z-to.d/2,-(to.rotation??0))
    }
    const other=relative(bh.x,bh.z,b,a), back=result.get(b.id)!.find(j=>j.neighborId===id)!
    if (Math.abs(ah.x-join.side*la.w/2)>.45 || Math.abs(bh.x-back.side*lb.w/2)>.45
      || Math.abs(ah.z-other.z)>.18 || Math.hypot(ah.x-other.x,ah.z-other.z)>.95) continue
    const x=join.side*la.w/2, z=(ah.z+other.z)/2
    if (z-.235<join.from || z+.235>join.to) continue
    const baseA=groundHeight(map,a.x+(a.w-1)/2,a.z+(a.d-1)/2)
    const baseB=groundHeight(map,b.x+(b.w-1)/2,b.z+(b.d-1)/2)
    const bottom=Math.max(.78,joinedRoofHeight(join,z)-.12)
    const top=Math.max(ah.chimneyTop,bh.chimneyTop+baseB-baseA,bottom+.30)
    join.chimney={side:join.side,x,z,bottom,top}
    const point=relative(x,z,a,b)
    back.chimney={side:back.side,...point,bottom:bottom+baseA-baseB,top:top+baseA-baseB}
    paired.add(id); paired.add(b.id)
  }
  return result

  function connect(a: BuildingDef, sideA: -1 | 1, b: BuildingDef, sideB: -1 | 1) {
    // No overlapping footprints or corner-only contact.
    if (a.x < b.x + b.w && a.x + a.w > b.x && a.z < b.z + b.d && a.z + a.d > b.z) return
    const la = rotatedFootprint(a, a.rotation), lb = rotatedFootprint(b, b.rotation)
    const offset = rotateBuildingPoint(b.x + b.w / 2 - a.x - a.w / 2,
      b.z + b.d / 2 - a.z - a.d / 2, -(a.rotation ?? 0))
    const direction = (a.rotation ?? 0) === (b.rotation ?? 0) ? 1 : -1
    const from = Math.max(-la.d / 2, offset.z - lb.d / 2), to = Math.min(la.d / 2, offset.z + lb.d / 2)
    if (to - from < .5) return
    const baseA = groundHeight(map, a.x + (a.w - 1) / 2, a.z + (a.d - 1) / 2)
    const baseB = groundHeight(map, b.x + (b.w - 1) / 2, b.z + (b.d - 1) / 2)
    if (Math.abs(baseA - baseB) > .08) return
    const pa = roofProfile(la.d, riseFor(a)), pb = roofProfile(lb.d, riseFor(b))
    const samples = [...new Set([from, to, ...pa.breaks, ...pb.breaks.map(z => offset.z + direction * z)])]
      .filter(z => z >= from && z <= to).sort((a, b) => a - b)
    const own = (z: number) => baseA + a.height + pa.height(z)
    const neighbor = (z: number) => baseB + b.height + pb.height(direction * (z - offset.z))
    if (samples.some(z => Math.abs(own(z) - neighbor(z)) > .12)) return
    // Include crossings of the two roof planes in their common upper envelope.
    const breaks = [...samples]
    for (const [i, z] of breaks.entries()) {
      const end = breaks[i + 1]
      if (end === undefined) continue
      const da = own(z) - neighbor(z), db = own(end) - neighbor(end)
      if (da * db < 0) samples.push(z + (end - z) * da / (da - db))
    }
    samples.sort((a, b) => a - b)
    const heights: [number, number][] = samples.map(z => [z, Math.max(own(z), neighbor(z))])
    const add = (id: string, join: RoofJoin) => result.set(id, [...(result.get(id) ?? []), join])
    add(a.id, { neighborId: b.id, side: sideA, from, to, heights: heights.map(([z, h]) => [z, h - baseA]) })
    const other: [number, number][] = heights.map(([z, h]) => [direction * (z - offset.z), h - baseB])
    other.sort((a, b) => a[0] - b[0])
    add(b.id, { neighborId: a.id, side: sideB, from: other[0][0], to: other[other.length - 1][0], heights: other })
  }
}

/** Connected roofs share ink, while raycasts and selected cutaways keep their own IDs. */
export function roofOutlineOwners(buildings: readonly BuildingDef[], joins: Map<string, RoofJoin[]>): number[] {
  const indices = new Map(buildings.map((b, i) => [b.id, i]))
  const owners = buildings.map((_, i) => i)
  const root = (i: number): number => owners[i] === i ? i : (owners[i] = root(owners[i]))
  for (const [id, edges] of joins) for (const edge of edges) {
    const a = indices.get(id), b = indices.get(edge.neighborId)
    if (a === undefined || b === undefined) continue
    const x = root(a), y = root(b)
    owners[Math.max(x, y)] = Math.min(x, y)
  }
  return owners.map((_, i) => root(i))
}
