import { bakeScenerySet } from "../environment/bake"
import { WATER_SOURCE_FRAME, WATER_SOURCE_KINDS, WATER_SOURCE_DEFINITIONS } from "./assets"
import { waterSourceModel } from "./model"

export async function bakeWaterSources() {
  const bake = await bakeScenerySet(WATER_SOURCE_FRAME, WATER_SOURCE_KINDS, waterSourceModel)
  return { ...bake, definitions: WATER_SOURCE_DEFINITIONS }
}
