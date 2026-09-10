import { rotatedFootprint, type BuildingRotation } from "./building-rotation"
import { innLayout } from "./inn-layout"
import { buildingHearth, hasDomesticHearth } from "./building-art/furnishings"
import { INN_OVERHANG, INN_ROOF_OVERHANG, INN_UPPER_ROOF_PITCH, singlePlaneRoofRise } from "./building-art/dimensions"
import type { BuildingDef, GameMap } from "./map/types"

export { INN_OVERHANG } from "./building-art/dimensions"

export const footprintsOverlap = (a: Pick<BuildingDef,"x"|"z"|"w"|"d">, b: Pick<BuildingDef,"x"|"z"|"w"|"d">) =>
  a.x < b.x+b.w && a.x+a.w > b.x && a.z < b.z+b.d && a.z+a.d > b.z

/** The upper dormitory covers the tavern’s entire footprint. */
export function innSupport(map: Pick<GameMap,"buildings">, candidate: BuildingDef): BuildingDef | undefined {
  if (candidate.buildType !== "inn") return undefined
  return map.buildings.find(b => {
    if (b.buildType !== "tavern" || b.supportId) return false
    const local = rotatedFootprint(b,b.rotation)
    if (local.w !== 3 || local.d !== 4) return false
    const footprint = rotatedFootprint({w:3,d:4},b.rotation)
    if (candidate.w !== footprint.w || candidate.d !== footprint.d || (candidate.rotation ?? 0) !== (b.rotation ?? 0)) return false
    return candidate.x === b.x && candidate.z === b.z
  })
}

export function innPlacementRotation(map: Pick<GameMap,"buildings">, candidate: BuildingDef): BuildingRotation {
  for (const b of map.buildings) {
    if (b.buildType !== "tavern") continue
    const rotation = b.rotation ?? 0
    if (innSupport({buildings:[b]},{...candidate,...rotatedFootprint({w:3,d:4},rotation),rotation})) return rotation
  }
  return candidate.rotation ?? 0
}

/** Undefined means ordinary ground placement; stacked sites preserve the host's access and ownership. */
export function innPlacementError(map: Pick<GameMap,"buildings">, candidate: BuildingDef): string | null | undefined {
  if (candidate.buildType !== "inn" || !map.buildings.some(b=>footprintsOverlap(candidate,b))) return undefined
  const host = innSupport(map,candidate)
  if (!host) return "Place the inn over the full footprint of a 3 × 4 tavern."
  if (host.owner === "independent") return "The tavern must belong to your settlement."
  if (host.construction && host.construction.work < host.construction.required) return "Finish the tavern before adding an inn."
  if (map.buildings.some(b=>b.id!==host.id && footprintsOverlap(candidate,b))) return "An upper floor already occupies these tiles."
  const projection=INN_OVERHANG+INN_ROOF_OVERHANG
  const expanded={...candidate,x:candidate.x-projection,z:candidate.z-projection,w:candidate.w+projection*2,d:candidate.d+projection*2}
  const floor=host.height+singlePlaneRoofRise(4)+.2
  if(map.buildings.some(b=> {
    if(b.id===host.id) return false
    const margin=b.supportId ? projection : 0
    const bounds={...b,x:b.x-margin,z:b.z-margin,w:b.w+margin*2,d:b.d+margin*2}
    const local=rotatedFootprint(b,b.rotation)
    const rise=b.buildType==="inn" && b.supportId ? (local.w/2+INN_OVERHANG)*INN_UPPER_ROOF_PITCH : singlePlaneRoofRise(local.d)
    const top=(b.floorHeight ?? 0)+b.height+rise+.2
    return top>floor-.32 && footprintsOverlap(expanded,bounds)
  })) return "Leave room beside the tavern for the inn’s overhanging upper walls and eaves."
  return null
}

export function innPlacementLayout(map: Pick<GameMap,"buildings">, candidate: BuildingDef) {
  const host = innSupport(map,candidate)
  const hearth=host && hasDomesticHearth(host.buildType,host.layoutSeed,host.fireplace)
    ? buildingHearth("tavern",3,4,host.height,singlePlaneRoofRise(4),host.layoutSeed,host.hearthZ) : undefined
  return { layoutSeed: candidate.layoutSeed, supportId: host?.id,
    floorHeight: host ? host.height+singlePlaneRoofRise(4)+.2 : undefined,
    fireplace: !host,
    tavernFlue: hearth ? {x:hearth.x,z:hearth.z} : undefined,
    hearthZ: innLayout(3,4).hearthZ }
}
