import { placementLayoutSeed } from "./building-layout"
import { BUILD_CATALOG, type GameBalance } from "./balance"
import { EARLY_BUILDINGS } from "./building-art/style"
import { levelBuildingGround } from "./map/elevation"
import type { BuildingDef, GameMap } from "./map/types"
import { createSettlement, placementError } from "./settlement"

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
  const examples: Omit<BuildingDef, "x" | "z">[] = [
    ...BUILD_CATALOG.map(def => ({ ...def, buildType: def.id })),
    // Only the relic enclosure stays outside the build menu; it is the shrine itself.
    ...EARLY_BUILDINGS.filter(def => !BUILD_CATALOG.some(b => b.id === def.id)).map(def => ({
      id: def.id, buildType: def.id, label: def.name, w: def.width, d: def.depth,
      height: def.wallHeight, color: "#8c7658", roofColor: "#a59164",
    })),
  ]
  if (withJobs) {
    const market = BUILD_CATALOG.find(b => b.id === "market")!
    const house = BUILD_CATALOG.find(b => b.id === "house")!
    examples.push({ ...market, id: "market-second", buildType: "market", label: "Market stall · second keeper" })
    for (let i = 0; i < 3; i++) examples.push({ ...house, id: `staff-house-${i}`, buildType: "house" })
  }
  const candidates = Array.from({ length: world.width * world.depth }, (_, i) => ({
    x: i % world.width, z: Math.floor(i / world.width),
  })).sort((a,b) => Math.hypot(a.x-world.site!.door.x,a.z-world.site!.door.z)
    - Math.hypot(b.x-world.site!.door.x,b.z-world.site!.door.z))
  for (const example of examples) {
    if (world.buildings.some(b => b.owner !== "independent" && b.buildType === example.buildType && b.id !== world.site?.hovelId)) continue
    const map = { ...world, elevation: settlement.elevation ?? world.elevation,
      buildings: [...world.buildings, ...settlement.structures] }
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
  const map = { ...world, elevation: settlement.elevation ?? world.elevation,
    buildings: [...world.buildings,...settlement.structures] }
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
