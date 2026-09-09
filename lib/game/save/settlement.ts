import { levelBuildingGround } from "../map/elevation"
import type { BuildingDef, GameMap } from "../map/types"
import type { Settlement } from "../settlement"
import type { SettlementSave, StructureSave } from "./schema"

/**
 * The settlement is already plain data except for `elevation`, a full copy of
 * the terrain after each purchase levelled its plot. That is far too large to
 * store and entirely reproducible: purchases are replayed over the generated
 * ground in order on load.
 */
export function captureSettlement(settlement: Settlement): SettlementSave {
  return {
    claimedBuildings: [...settlement.claimedBuildings],
    resources: { ...settlement.resources },
    deliveredWood: settlement.deliveredWood,
    spentWood: settlement.spentWood,
    shrineAdmission: settlement.shrineAdmission,
    collectedAdmission: settlement.collectedAdmission,
    collectedTrade: settlement.collectedTrade,
    structures: settlement.structures.map(captureStructure),
  }
}

function captureStructure(building: BuildingDef): StructureSave {
  return {
    id: building.id,
    buildType: building.buildType ?? "",
    label: building.label,
    x: building.x, z: building.z, w: building.w, d: building.d,
    rotation: building.rotation,
    height: building.height,
    color: building.color,
    roofColor: building.roofColor,
    admissionFee: building.admissionFee,
    construction: building.construction ? {
      work: building.construction.work,
      required: building.construction.required,
      cost: building.construction.cost ? { ...building.construction.cost } : undefined,
    } : undefined,
  }
}

/** Structures outside the map, or sharing an id, cannot have been bought here. */
function fitsWorld(world: GameMap, structure: StructureSave, seen: Set<string>): boolean {
  if (seen.has(structure.id)) return false
  seen.add(structure.id)
  return structure.x + structure.w <= world.width && structure.z + structure.d <= world.depth
}

export function restoreSettlement(world: GameMap, save: SettlementSave): Settlement {
  const seen = new Set(world.buildings.map(building => building.id))
  const structures: BuildingDef[] = []
  let elevation = world.elevation
  for (const structure of save.structures) {
    if (!fitsWorld(world, structure, seen)) continue
    const building: BuildingDef = {
      id: structure.id,
      buildType: structure.buildType || undefined,
      label: structure.label,
      x: structure.x, z: structure.z, w: structure.w, d: structure.d,
      rotation: structure.rotation,
      height: structure.height,
      color: structure.color,
      roofColor: structure.roofColor,
    }
    if (structure.admissionFee !== undefined) building.admissionFee = structure.admissionFee
    if (structure.construction) building.construction = {
      work: structure.construction.work,
      required: structure.construction.required,
      ...(structure.construction.cost ? { cost: { ...structure.construction.cost } } : {}),
    }
    elevation = levelBuildingGround({ ...world, elevation, buildings: [...world.buildings, ...structures] }, building) ?? elevation
    structures.push(building)
  }
  const known = new Set(world.buildings.map(building => building.id))
  return {
    claimedBuildings: save.claimedBuildings.filter(id => known.has(id)),
    elevation: elevation === world.elevation ? undefined : elevation,
    resources: { ...save.resources },
    deliveredWood: save.deliveredWood,
    spentWood: save.spentWood,
    shrineAdmission: save.shrineAdmission,
    collectedAdmission: save.collectedAdmission,
    collectedTrade: save.collectedTrade,
    structures,
  }
}
