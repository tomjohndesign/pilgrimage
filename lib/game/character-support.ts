import type { BaseClip } from "./base-person/pose"
import type { BuildingPart } from "./building-art/geometry"
import { structureParts, shrineStructureParts } from "./building-art/structure"
import { entranceParts } from "./building-art/entrance"
import { buildingDoorOffset, buildingEntry, buildingYaw, rotatedFootprint } from "./building-rotation"
import { groundHeight } from "./map/elevation"
import { tileToWorldX, tileToWorldZ, type BuildingDef, type GameMap } from "./map/types"
import { shrineLayout } from "./shrine-layout"

export interface CharacterSupport {
  id: string
  clips: readonly BaseClip[]
  x: number
  z: number
  height: number
  width: number
  depth: number
  yaw: number
  anchor: { x: number; z: number }
  heading: number
}

/** Read contacts before render batching; top faces stay tied to the actual artwork. */
export function partSupports(parts: readonly BuildingPart[]): CharacterSupport[] {
  return parts.flatMap(part => {
    if (!part.support || !part.size) return []
    // This contract describes horizontal tops, including yaw-rotated furniture.
    if (part.rotation?.[0] || part.rotation?.[2]) return []
    const [x, y, z] = part.position, [width, height, depth] = part.size
    const yaw = part.rotation?.[1] ?? 0, [ax, az] = part.support.anchorOffset ?? [0, 0]
    return [{ id: part.name, clips: part.support.clips, x, z, height: y + height / 2, width, depth, yaw,
      anchor: { x: x + ax * Math.cos(yaw) + az * Math.sin(yaw), z: z + az * Math.cos(yaw) - ax * Math.sin(yaw) },
      heading: yaw + (part.support.heading ?? 0) }]
  })
}

const cache = new WeakMap<BuildingDef, { key: string; supports: CharacterSupport[] }>()

/** Building-local surfaces, cached across frames and refreshed after recipe edits. */
export function buildingSupports(building: BuildingDef, map?: GameMap) {
  const shrine = map?.site?.hovelId === building.id ? shrineLayout(building, map.site.door) : undefined
  const local = rotatedFootprint(building, building.rotation)
  const key = JSON.stringify([building.buildType, local.w, local.d, building.height, building.color, building.roofColor, building.layoutSeed, building.hearthZ, building.fireplace, shrine?.width, shrine?.depth])
  let entry = cache.get(building)
  if (entry?.key !== key) {
    const supports = partSupports(shrine ? shrineStructureParts(shrine.width, shrine.depth) : structureParts({ ...building, ...local }))
    if (!shrine) {
      // Entrance props are drawn in the approach tile's frame, outside the shell.
      const x = buildingDoorOffset(local.w, building.buildType, building.layoutSeed), z = (local.d + 1) / 2
      for (const support of partSupports(entranceParts(building.buildType ?? "house", building.height))) {
        supports.push({ ...support, x: support.x + x, z: support.z + z,
          anchor: { x: support.anchor.x + x, z: support.anchor.z + z } })
      }
    }
    entry = { key, supports }
    cache.set(building, entry)
  }
  return entry.supports
}

/** Resolve furniture in the same placed frame as Buildings and Shrine. */
export function placedSupport(map: GameMap, building: BuildingDef, support: CharacterSupport): CharacterSupport {
  const yaw = map.site?.hovelId === building.id ? shrineLayout(building, map.site.door).rotation : buildingYaw(building.rotation)
  const cx = tileToWorldX(map, building.x) + (building.w - 1) / 2
  const cz = tileToWorldZ(map, building.z) + (building.d - 1) / 2
  const point = (x: number, z: number) => ({ x: cx + x * Math.cos(yaw) + z * Math.sin(yaw), z: cz + z * Math.cos(yaw) - x * Math.sin(yaw) })
  const entry = buildingEntry(building)
  const ground = support.id.startsWith("entry-") ? groundHeight(map, entry.x, entry.z)
    : groundHeight(map, building.x + (building.w - 1) / 2, building.z + (building.d - 1) / 2)
  return { ...support, ...point(support.x, support.z), anchor: point(support.anchor.x, support.anchor.z),
    height: ground + support.height,
    yaw: support.yaw + yaw, heading: support.heading + yaw }
}

/** Only an authored, compatible top under the actor can support its current pose. */
export function characterSupport(map: GameMap, x: number, z: number, clip: BaseClip): CharacterSupport | undefined {
  let highest: CharacterSupport | undefined
  for (const building of map.buildings) {
    if (building.construction && building.construction.work < building.construction.required) continue
    const cx = tileToWorldX(map, building.x) + (building.w - 1) / 2, cz = tileToWorldZ(map, building.z) + (building.d - 1) / 2
    if (Math.abs(x - cx) > building.w / 2 + .6 || Math.abs(z - cz) > building.d / 2 + .6) continue
    for (const local of buildingSupports(building, map)) {
      if (!local.clips.includes(clip)) continue
      const support = placedSupport(map, building, local)
      const dx = x - support.x, dz = z - support.z
      const sx = dx * Math.cos(support.yaw) - dz * Math.sin(support.yaw)
      const sz = dx * Math.sin(support.yaw) + dz * Math.cos(support.yaw)
      if (Math.abs(sx) > support.width / 2 + 1e-6 || Math.abs(sz) > support.depth / 2 + 1e-6) continue
      if (!highest || support.height > highest.height) highest = support
    }
  }
  return highest
}
