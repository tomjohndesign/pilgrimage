import { describe, expect, it } from "vitest"
import { BUILDING_KINDS } from "../buildings"
import { DEFAULT_WALK_SPEED, personWalkStride } from "../base-person/gait"
import { POPULATION_PROFILES } from "../base-person/population"
import { BASE_PERSON, PERSON_CLIPS } from "../base-person/pose"
import { JOB_POPULATION, jobVisual } from "./assets"
import { SETTLEMENT_JOBS, jobDesign, jobSpeedScale, settlementJob, type SettlementJob } from "./design"

const jobs = Object.keys(SETTLEMENT_JOBS) as SettlementJob[]

describe("settlement job sprites", () => {
  it("maps every workplace to an outfit only after accepting employment", () => {
    const buildings = Object.values(BUILDING_KINDS).map(kind => ({ id: `${kind.id}-1`, kind: kind.id }))
    expect(buildings.map(building => settlementJob(building.id, buildings))).toEqual(jobs)
    expect(settlementJob(null, buildings)).toBeNull()
    expect(settlementJob("removed-building", buildings)).toBeNull()
  })

  it("ships every job for both genders and all body profiles on the current rig", () => {
    expect(JOB_POPULATION.templateVersion).toBe(BASE_PERSON.version)
    expect(Object.keys(JOB_POPULATION.callings)).toEqual(jobs)
    for (const job of jobs) for (const [variant, profile] of POPULATION_PROFILES.entries()) {
      const visual = jobVisual(job, variant)
      expect(visual.design).toEqual(jobDesign(job, variant))
      expect(visual.design.bodyType).toBe(profile.bodyType)
      expect(visual.design.hairStyle).toBe(profile.hair)
      expect(visual.reservedTones).toBe(true)
      expect(visual.rowOffset).toBe(variant * 8)
      expect(visual.walkStride).toBeCloseTo(personWalkStride(visual.design))
      const clips = { idle: visual.idle, walk: visual.walk, ...visual.actions }
      for (const [clip, definition] of Object.entries(PERSON_CLIPS)) {
        const atlas = clips[clip as keyof typeof clips]
        expect(atlas, `${job}/${profile.id}/${clip}`).toBeDefined()
        expect(atlas?.columns).toBe(definition.frames)
        expect(atlas?.rows).toBe(48)
        expect(atlas?.url).toContain(`/jobs/v3/${job}-`)
        expect(atlas?.depth).toContain(`/jobs/v3/${job}-depth-`)
      }
      for (const scale of [0.75, 1.5, 2]) {
        expect(DEFAULT_WALK_SPEED * jobSpeedScale(job, variant, scale) / (visual.walkStride * scale) * 120).toBeCloseTo(138)
      }
    }
  })
})
