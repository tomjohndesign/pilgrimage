import { Box3, Euler, Matrix4, Quaternion, Vector3 } from "three"
import { normalizeBuildingRotation, rotateBuildingPoint, rotatedFootprint, type BuildingRotation } from "./building-rotation"
import { innLayout } from "./inn-layout"
import { structureParts } from "./building-art/structure"
import { buildingHearth, hasDomesticHearth } from "./building-art/furnishings"
import { INN_OVERHANG, INN_ROOF_OVERHANG, singlePlaneRoofRise } from "./building-art/dimensions"
import type { BuildingDef, GameMap, TilePos } from "./map/types"

export const footprintsOverlap = (a: Pick<BuildingDef,"x"|"z"|"w"|"d">, b: Pick<BuildingDef,"x"|"z"|"w"|"d">) =>
  a.x < b.x+b.w && a.x+a.w > b.x && a.z < b.z+b.d && a.z+a.d > b.z

/** The upper dormitory covers the tavern’s entire footprint. */
export function innSupport(map: Pick<GameMap,"buildings">,
  candidate: Pick<BuildingDef,"buildType"|"x"|"z"|"w"|"d"|"rotation">): BuildingDef | undefined {
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

/** An upper floor fits one host exactly, so every tile of that host resolves to
 * the same site: hovering anywhere over the tavern snaps the inn onto its roof.
 * Ordinary ground placements keep the hovered tile.
 */
export function innStackSite(map: Pick<GameMap,"buildings">, buildType: string | undefined, at: TilePos):
  (TilePos & {rotation: BuildingRotation}) | undefined {
  if (buildType !== "inn") return undefined
  for (const host of map.buildings) {
    if (at.x<host.x || at.x>=host.x+host.w || at.z<host.z || at.z>=host.z+host.d) continue
    const rotation = normalizeBuildingRotation(host.rotation ?? 0)
    const site = {x:host.x,z:host.z,rotation}
    if (innSupport({buildings:[host]},{...site,...rotatedFootprint({w:3,d:4},rotation),buildType})) return site
  }
  return undefined
}

export function innPlacementRotation(map: Pick<GameMap,"buildings">, candidate: BuildingDef): BuildingRotation {
  return innStackSite(map,candidate.buildType,candidate)?.rotation ?? candidate.rotation ?? 0
}

/** A hair of daylight between the jettied floor and whatever already stands
 * beside it, so touching art never reads as one shape pushed through another. */
const INN_CLEARANCE = .02

/** Shapes repeat across a settlement and across every frame of a drag. */
const boundsCache = new Map<string,Box3[]>()

/** Every authored box of a placed structure, in map tiles and world height.
 * Roof pitch, eaves, jetties and chimney stacks all come from the art the game
 * already draws, so a placement rule never restates the shell's dimensions.
 */
function structureBounds(building: BuildingDef): Box3[] {
  const local = rotatedFootprint(building,building.rotation)
  const key = [building.buildType,local.w,local.d,building.height,building.rotation ?? 0,building.layoutSeed ?? 0,
    building.hearthZ,building.fireplace,building.supportId ?? "",building.floorHeight ?? 0,
    building.tavernFlue?.x,building.tavernFlue?.z].join("/")
  let boxes = boundsCache.get(key)
  if (!boxes) {
    boxes = structureParts({...building,...local}).flatMap(part => {
      const box = new Box3()
      const transform = new Matrix4().compose(new Vector3(...part.position),
        new Quaternion().setFromEuler(new Euler(...part.rotation ?? [0,0,0])), new Vector3(1,1,1))
      if (part.size) box.setFromCenterAndSize(new Vector3(),new Vector3(...part.size)).applyMatrix4(transform)
      else for (let i=0;i<(part.vertices?.length ?? 0);i+=3) box.expandByPoint(new Vector3().fromArray(part.vertices!,i).applyMatrix4(transform))
      if (box.isEmpty()) return []
      const near = rotateBuildingPoint(box.min.x,box.min.z,building.rotation)
      const far = rotateBuildingPoint(box.max.x,box.max.z,building.rotation)
      return [new Box3(new Vector3(Math.min(near.x,far.x),box.min.y,Math.min(near.z,far.z)),
        new Vector3(Math.max(near.x,far.x),box.max.y,Math.max(near.z,far.z)))]
    })
    if (boundsCache.size > 64) boundsCache.clear()
    boundsCache.set(key,boxes)
  }
  const centre = new Vector3(building.x+building.w/2,building.floorHeight ?? 0,building.z+building.d/2)
  return boxes.map(box => box.clone().translate(centre))
}

/** Undefined means ordinary ground placement; stacked sites preserve the host's access and ownership. */
export function innPlacementError(map: Pick<GameMap,"buildings">, candidate: BuildingDef): string | null | undefined {
  if (candidate.buildType !== "inn" || !map.buildings.some(b=>footprintsOverlap(candidate,b))) return undefined
  const host = innSupport(map,candidate)
  if (!host) return "Place the inn over the full footprint of a 3 × 4 tavern."
  if (host.owner === "independent") return "The tavern must belong to your settlement."
  if (host.construction && host.construction.work < host.construction.required) return "Finish the tavern before adding an inn."
  if (map.buildings.some(b=>b.id!==host.id && footprintsOverlap(candidate,b))) return "An upper floor already occupies these tiles."
  const projection=INN_OVERHANG+INN_ROOF_OVERHANG+INN_CLEARANCE
  const expanded={...candidate,x:candidate.x-projection,z:candidate.z-projection,w:candidate.w+projection*2,d:candidate.d+projection*2}
  const neighbors=map.buildings.filter(b=>b.id!==host.id && footprintsOverlap(expanded,b))
  if(!neighbors.length) return null
  // Only the upstairs storey reaches past the tavern, and only well above the
  // neighbouring eaves. Its jetty brackets hang over a lower roofline the way a
  // real jetty does, so the rule guards the deck, walls and roof above them.
  const upper={...candidate,...innPlacementLayout(map,candidate)}
  const deck=upper.floorHeight!-INN_CLEARANCE
  const storey=structureBounds(upper).flatMap(box => {
    box.expandByScalar(INN_CLEARANCE)
    box.min.y=Math.max(box.min.y,deck)
    const beyond=box.min.x<candidate.x || box.max.x>candidate.x+candidate.w
      || box.min.z<candidate.z || box.max.z>candidate.z+candidate.d
    return beyond && box.min.y<box.max.y ? [box] : []
  })
  if(neighbors.some(b=>structureBounds(b).some(box=>box.max.y>deck && storey.some(part=>part.intersectsBox(box)))))
    return "Leave room beside the tavern for the inn’s overhanging upper walls and eaves."
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
