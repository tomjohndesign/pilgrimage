import { innLadderParts, innParts } from "./inn"
import { innLayout } from "../inn-layout"
import { waterSourceParts } from "../water-sources/model"
import type { CrossroadArm } from "../map/crossroads"
import { wallSide } from "./cutaway"
import type { BuildingDef } from "../map/types"
import { buildingParts, type BuildingPart } from "./geometry"
import { earlyBuildingParts, type SettlementBuildingType } from "./early-geometry"
import { EARLY_BUILDINGS, earlyBuildingRecipe } from "./style"
import { INN_OVERHANG, singlePlaneRoofRise } from "./dimensions"
import type { RoofJoin } from "./roof-joins"

export type StructureAppearance = Pick<BuildingDef, "buildType" | "w" | "d" | "height" | "color" | "roofColor" | "layoutSeed" | "hearthZ" | "fireplace" | "floorHeight" | "supportId" | "tavernFlue">

const SETTLEMENT_TYPES: readonly SettlementBuildingType[] = [
  "shelter", "workshop", "hall", "garden", "cross", "lumberCamp", "market", "guard-post", "sheep-pen",
]

function isSettlementType(type: string | undefined): type is SettlementBuildingType {
  return SETTLEMENT_TYPES.some(item => item === type)
}

/** One source for placed structures, construction ghosts and build-menu images. */
export function structureParts(building: StructureAppearance, roofJoins: RoofJoin[] = []): BuildingPart[] {
  if (building.buildType === "well" || building.buildType === "watering-hole") return waterSourceParts(building.buildType)
  const preset = EARLY_BUILDINGS.find((item) => item.id === building.buildType)
  if (preset) {
    const parts = building.buildType === "inn" && building.supportId
      ? innParts(building.w,building.d,building.height,false,17+(building.layoutSeed ?? 0),true,building.tavernFlue)
      : earlyBuildingParts({ ...earlyBuildingRecipe(preset.id), layoutSeed: building.layoutSeed, hearthZ: building.hearthZ, fireplace: building.fireplace, roofJoins, width: building.w, depth: building.d, wallHeight: building.height,
      roofRise: preset.id === "enclosure" ? 0 : singlePlaneRoofRise(building.d) })
    if (building.buildType === "inn" && building.supportId && building.floorHeight) {
      // The ladder opens into the right aisle beside the middle row of beds.
      const {x:hatchX,z:hatchZ}=innLayout(building.w,building.d,true).hatch
      const deckW=building.w+INN_OVERHANG*2,deckD=building.d+INN_OVERHANG*2
      const deck=parts.filter(p=>p.name!=="floor" && !p.name.startsWith("inn-floorboard-"))
      const plank=(name:string,x:number,z:number,w:number,d:number):BuildingPart=>({name,layer:"base",position:[x,.018,z],size:[w,.04,d],color:"#987e58",outline:false})
      const left=-deckW/2+.06,right=deckW/2-.06
      deck.push(plank("inn-deck-side--1",(left+hatchX-.24)/2,0,hatchX-.24-left,deckD-.12),
        plank("inn-deck-side-1",(right+hatchX+.24)/2,0,right-hatchX-.24,deckD-.12))
      const back=-deckD/2+.06,front=deckD/2-.06
      deck.push(plank("inn-deck-back",hatchX,(back+hatchZ-.24)/2,.48,hatchZ-.24-back),
        plank("inn-deck-front",hatchX,(front+hatchZ+.24)/2,.48,front-hatchZ-.24))
      return [...deck,...innLadderParts(building.floorHeight,building.w,building.d)]
    }
    // Food and timber are live inventories; leave room for them in the store.
    if (building.buildType !== "storehouse") return building.buildType === "workshop" ? parts.filter(p=>!p.name.startsWith("firewood-")) : parts
    const contents: BuildingPart[] = []
    // Empty food bins remain recognizable before the first delivery.
    const binWidth = building.w * 0.18, binDepth = building.d * 0.16
    for (let slot = 0; slot < 4; slot++) {
      const x = (slot - 1.5) * building.w * 0.21, z = -building.d * 0.33
      const box = (name: string, position: BuildingPart["position"], size: BuildingPart["size"]) =>
        contents.push({ name: `food-bin-${slot}-${name}`, layer: "interior", position, size, color: "#8c7658", outline: false })
      box("bottom", [x, 0.35, z], [binWidth, 0.04, binDepth])
      for (const side of [-1, 1]) {
        box(`side-${side}`, [x + side * binWidth / 2, 0.44, z], [0.025, 0.18, binDepth])
        box(`end-${side}`, [x, 0.44, z + side * binDepth / 2], [binWidth, 0.18, 0.025])
      }
    }
    return [...parts.filter(p => p.name !== "grain-sack"), ...contents]
  }

  if (isSettlementType(building.buildType)) return earlyBuildingParts({
    ...earlyBuildingRecipe("house"),
    variant: building.buildType,
    layoutSeed: building.layoutSeed, hearthZ: building.hearthZ, fireplace: building.fireplace, roofJoins,
    width: building.w,
    depth: building.d,
    wallHeight: building.height,
    roofRise: singlePlaneRoofRise(building.d),
  }).filter(p => building.buildType !== "workshop" || !p.name.startsWith("firewood-"))

  // Untyped, older map structures also receive real construction at their footprint.
  return buildingParts({
    ...earlyBuildingRecipe("house"),
    width: building.w,
    depth: building.d,
    wallHeight: Math.max(0.25, Math.min(1.4, building.height)),
    roofRise: singlePlaneRoofRise(building.d),
  })
}

/** Remove every roof and the near walls; retain the walls behind the interior. */
export function visibleStructureParts(parts: BuildingPart[], cutaway: boolean, camera: [number, number] = [1, 1]): BuildingPart[] {
  return cutaway ? parts.filter(p => {
    if (p.layer === "roof") return false
    if (p.layer !== "wall") return true
    const side = wallSide(p)
    return side[0] * camera[0] + side[1] * camera[1] < -0.001
  }) : parts
}

/** Shared wayside timber used by the forest's existing warning signs. */
export const SIGNPOST_HEIGHT = .78
export function signpostParts(seed = 0): BuildingPart[] {
  return earlyBuildingParts({
    ...earlyBuildingRecipe("house"),
    variant: "signpost", width: 1, depth: 1, wallHeight: SIGNPOST_HEIGHT, roofRise: 0, seed,
  })
}

/** More room on the crossroads post for three or four independently marked boards. */
const CROSSROAD_SIGNPOST_HEIGHT = 1.15

/** Riven boards carry simple painted symbols on both faces: cross, road or trail. */
export function crossroadSignpostParts(seed = 0, arms: CrossroadArm[] = [{ direction: { x: 1, z: 0 }, mark: "shrine" }]): BuildingPart[] {
  const source = earlyBuildingParts({
    ...earlyBuildingRecipe("house"),
    variant: "signpost", width: 1, depth: 1, wallHeight: CROSSROAD_SIGNPOST_HEIGHT, roofRise: 0, seed,
  })
  const parts = source.filter(p => !/signpost-(board|peg|cross)/.test(p.name))
  const board = source.filter(p => /signpost-(board|peg)$/.test(p.name))
  arms.forEach((arm, index) => {
    const yaw = Math.atan2(-arm.direction.z, arm.direction.x), offset = -.22 * index
    const local = [...board]
    const stroke = (name: string, x: number, y: number, sx: number, sy: number) => {
      for (const side of [-1, 1]) local.push({ name: `mark-${arm.mark}-${name}-${side}`, layer: "wall",
        position: [x, CROSSROAD_SIGNPOST_HEIGHT - .215 + y, side * .028], size: [sx, sy, .008], color: "#493d2b", outline: false })
    }
    if (arm.mark === "shrine") { stroke("upright", .16, 0, .028, .13); stroke("arm", .16, .025, .1, .026) }
    else if (arm.mark === "road") { stroke("rut-a", .17, -.034, .16, .025); stroke("rut-b", .17, .034, .16, .025) }
    else for (let i = 0; i < 3; i++) stroke(`step-${i}`, .1 + i * .06, (i % 2 ? 1 : -1) * .025, .026, .04)
    const turn = ([x, y, z]: number[]): [number, number, number] => [x * Math.cos(yaw) + z * Math.sin(yaw), y + offset, -x * Math.sin(yaw) + z * Math.cos(yaw)]
    for (const part of local) {
      const vertices = part.vertices?.flatMap((_, i, a) => i % 3 === 0 ? turn(a.slice(i, i + 3)) : [])
      parts.push({ ...part, name: `direction-${index}-${part.name}`,
        position: vertices ? [0, 0, 0] : turn(part.position), vertices,
        rotation: vertices ? undefined : [0, yaw, 0] })
    }
  })
  return parts
}

export { shrineStructureParts } from "./shrine-geometry"
