import manifest from "../../../public/textures/characters/jobs/v2/manifest.json"
import { outfitVisual } from "../base-person/population-assets"
import type { PopulationPack } from "../base-person/population"
import { validatePersonDesign } from "../base-person/design"
import type { SettlementJob } from "./design"

export const JOB_POPULATION: PopulationPack<SettlementJob> = { ...manifest,
  callings: Object.fromEntries(Object.entries(manifest.callings).map(([job, entry]) =>
    [job, { ...entry, designs: entry.designs.map(validatePersonDesign) }])) as PopulationPack<SettlementJob>["callings"] }

export function jobVisual(job: SettlementJob, variant: number) {
  return outfitVisual(JOB_POPULATION, JOB_POPULATION.callings[job], variant)
}
