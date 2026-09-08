import { bakeOutfits } from "../base-person/bake-population"
import { SETTLEMENT_JOBS, jobDesign, type SettlementJob } from "./design"

export function bakeJobs(progress?: (done: number) => void) {
  return bakeOutfits((Object.keys(SETTLEMENT_JOBS) as SettlementJob[]).map(id => ({ id, grey: false })),
    (id, variant) => jobDesign(id, variant), undefined, progress)
}
