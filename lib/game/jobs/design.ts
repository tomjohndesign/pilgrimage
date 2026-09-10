import { personWalkStride, walkSpeedScale } from "../base-person/gait"
import { populationDesign, POPULATION_PROFILES } from "../base-person/population"
import type { BuildingKind } from "../buildings"
import { DEFAULT_DESIGN, validatePersonDesign, type PersonDesign } from "../base-person/design"

/** Work clothing uses the existing wool/linen garments, caps and leather equipment. */
export const SETTLEMENT_JOBS = {
  woodcutter: { label: "Woodcutter", color: "#75513b", hat: "Wool cap", shirtColor: "#b49c78", coveringColor: "#75513b", satchel: false, walkingStick: false },
  tavern: { label: "Tavern worker", color: "#8b493c", hat: "Coif", shirtColor: "#e0d0ab", coveringColor: "#e0d0ab", satchel: false, walkingStick: false },
  shepherd: { label: "Shepherd", color: "#69704b", hat: "Wool cap", shirtColor: "#b6a583", coveringColor: "#69704b", satchel: true, walkingStick: true },
  market: { label: "Market keeper", color: "#b08a48", hat: "Cloth cap", shirtColor: "#69808a", coveringColor: "#69808a", satchel: true, walkingStick: false },
} as const
export type SettlementJob = keyof typeof SETTLEMENT_JOBS

const BUILDING_JOBS: Record<BuildingKind, SettlementJob> = {
  workshop: "woodcutter", tavern: "tavern", inn: "tavern", "sheep-pen": "shepherd", market: "market",
}

export function settlementJob(employer: string | null | undefined, buildings: readonly { id: string; kind: BuildingKind }[]): SettlementJob | null {
  const building = employer ? buildings.find(building => building.id === employer) : undefined
  return building ? BUILDING_JOBS[building.kind] : null
}

/** Keep each person's authored body and hair while exchanging their road equipment. */
export function jobDesign(job: SettlementJob, variant: number, base: PersonDesign = DEFAULT_DESIGN): PersonDesign {
  const outfit = SETTLEMENT_JOBS[job]
  const body = populationDesign({ id: "peasant", color: outfit.color }, variant, base)
  return validatePersonDesign({ ...body, ...outfit, tunicColor: outfit.color,
    garment: "Everyday", footwear: "Boots", beltStyle: "Leather", walkStyle: "Natural",
    tunicStyle: "Plain", lute: false, handTool: job === "shepherd" ? "Shepherd crook" : job === "woodcutter" ? "Carried axe" : "None" })
}

const JOB_STRIDES = Object.fromEntries((Object.keys(SETTLEMENT_JOBS) as SettlementJob[]).map(job =>
  [job, POPULATION_PROFILES.map((_, variant) => personWalkStride(jobDesign(job, variant)))])) as Record<SettlementJob, number[]>

export function jobSpeedScale(job: SettlementJob, variant: number, scale: number): number {
  return walkSpeedScale(JOB_STRIDES[job][variant], scale)
}
