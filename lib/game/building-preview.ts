import { housingCapacity } from "./housing"
import { placementLayoutSeed } from "./building-layout"
import { BUILD_CATALOG, type GameBalance } from "./balance"
import { AVAILABLE_EARLY_BUILDINGS, REMOVED_BUILDING_TYPES } from "./building-art/style"
import { levelBuildingGround } from "./map/elevation"
import type { BuildingDef, GameMap } from "./map/types"
import { createSettlement, placementError, purchaseStructure, settlementMap, upgradeChurch } from "./settlement"
import { churchWing, churchWingRotation } from "./church-additions"
import { rotatedFootprint } from "./building-rotation"
import { BUILDING_KINDS, buildingKind } from "./buildings"

/** Opt-in local play session for comparing the complete building kit. */
export const BUILDING_PREVIEW = process.env.NODE_ENV === "development"
  && process.env.NEXT_PUBLIC_BUILDING_PREVIEW === "1"

export const JOB_PREVIEW = BUILDING_PREVIEW && process.env.NEXT_PUBLIC_JOB_PREVIEW === "1"

export function buildingPreviewBalance(balance: GameBalance): GameBalance {
  return { ...balance, rules: { ...balance.rules, startingGold: 100000, startingWood: 100000, buildRadius: 128 },
    buildings: Object.fromEntries(Object.entries(balance.buildings).map(([id, tuning]) =>
      [id, { ...tuning, requiredRenown: 0 }])) as GameBalance["buildings"] }
}

/** Use normal placement checks so every example retains a reachable entrance. */
export function buildingPreviewSettlement(world: GameMap, balance: GameBalance, withJobs = JOB_PREVIEW) {
  let settlement = createSettlement(balance)
  if (!world.site) return settlement
  // Build the real church compound before laying out the surrounding gallery.
  const upgraded = upgradeChurch(settlement, world)
  if (!upgraded.error) settlement = { ...upgraded.settlement, church: { ...upgraded.settlement.church!, construction: undefined } }
  const candidates = Array.from({ length: world.width * world.depth }, (_, i) => ({
    x: i % world.width, z: Math.floor(i / world.width),
  })).sort((a,b) => Math.hypot(a.x-world.site!.door.x,a.z-world.site!.door.z)
    - Math.hypot(b.x-world.site!.door.x,b.z-world.site!.door.z))
  const churchMap = settlementMap(world, settlement)
  const residence = BUILD_CATALOG.find(b => b.id === "monk-shelter")!
  for (const at of candidates) {
    const rotation = churchWingRotation(churchMap, at, 0)
    if (!churchWing(churchMap, { ...at, ...rotatedFootprint(residence, rotation), buildType: residence.id })) continue
    const result = purchaseStructure(settlement, world, [], [], residence.id, at, balance, 0, rotation)
    if (result.error) continue
    settlement = { ...result.settlement, structures: result.settlement.structures.map(b =>
      b.buildType === residence.id ? { ...b, id: "preview-monk-shelter", construction: undefined } : b) }
    break
  }
  const examples: Omit<BuildingDef, "x" | "z">[] = [
    ...BUILD_CATALOG.filter(def => !REMOVED_BUILDING_TYPES.includes(def.id) && def.id !== "monk-shelter").map(def => ({ ...def, buildType: def.id })),
    // Include selectable art presets that have no standalone build-menu entry.
    ...AVAILABLE_EARLY_BUILDINGS.filter(def => !BUILD_CATALOG.some(b => b.id === def.id)).map(def => ({
      id: def.id, buildType: def.id, label: def.name, w: def.width, d: def.depth,
      height: def.wallHeight, color: "#8c7658", roofColor: "#a59164",
    })),
  ]
  if (withJobs) {
    const market = BUILD_CATALOG.find(b => b.id === "market")!
    const house = BUILD_CATALOG.find(b => b.id === "house")!
    examples.push({ ...market, id: "market-second", buildType: "market", label: "Market stall · second keeper" })
    const jobs=examples.reduce((total,b)=>total+(buildingKind(b.buildType) ? BUILDING_KINDS[buildingKind(b.buildType)!].jobs : 0),BUILDING_KINDS.tavern.jobs)
    // The catalogue house and the later joined-roof house each house eight.
    const capacity = housingCapacity({ ...house, x: 0, z: 0, buildType: "house" })
    for (let i = 0; i < Math.ceil((jobs-capacity*2)/capacity); i++) examples.push({ ...house, id: `staff-house-${i}`, buildType: "house" })
  }
  for (const example of examples) {
    if (world.buildings.some(b => b.owner !== "independent" && b.buildType === example.buildType && b.id !== world.site?.hovelId)) continue
    const map = settlementMap(world, settlement)
    // The gallery's woodcutter can be inspected even away from harvestable trees.
    const placement = { ...BUILD_CATALOG[0], ...example, id: "shelter" as const }
    const at = candidates.find(at => {
      if (map.buildings.some(b => at.x < b.x+b.w+1 && at.x+example.w+1 > b.x
        && at.z < b.z+b.d+1 && at.z+example.d+1 > b.z)) return false
      return placementError(map, placement, at, balance) === null
    })
    if (!at) continue
    const building = { ...example, ...at, layoutSeed: placementLayoutSeed(example.buildType ?? "", at, map.seed), id: `preview-${example.id}`, rotation: 0 as const }
    settlement = { ...settlement, elevation: levelBuildingGround(map, building),
      structures: [...settlement.structures, building] }
  }
  // A short home joins the front half of a deeper tavern, as an uneven compound.
  const map = settlementMap(world, settlement)
  const pair = { ...BUILD_CATALOG[0], w: 5, d: 4 }
  const at = candidates.find(at => !map.buildings.some(b => at.x < b.x+b.w+1 && at.x+pair.w+1 > b.x
    && at.z < b.z+b.d+1 && at.z+pair.d+1 > b.z) && placementError(map,pair,at,balance) === null)
  if(at) {
    const module = { buildType: "house", w: 2, d: 2, height: .70, color: "#8c7658", roofColor: "#a59164" }
    settlement = { ...settlement, elevation: levelBuildingGround(map,{...at,w:5,d:4}),
      structures: [...settlement.structures,
        { ...module,x:at.x,z:at.z+2,id:"preview-roofline-left",layoutSeed:0,label:"Joined roof · house",rotation:0 },
        { ...module,buildType:"tavern",w:3,d:4,height:.78,x:at.x+2,z:at.z,id:"preview-roofline-right",layoutSeed:3,label:"Joined roof · tavern",rotation:0 },
      ] }
  }
  return settlement
}
