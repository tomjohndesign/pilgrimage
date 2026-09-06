import { describe, expect, it } from "vitest"
import { PERSON_PRESETS, personRecipe } from "./design"
import { staffMotion, STAFF_PLANT_END, STAFF_STRIDES } from "./staff-motion"
import { populationDesign } from "./population"
import { TRAVELER_TYPES } from "../travelers"
import { advanceWalkPhase, walkClipFrame } from "../motion"
import { walkContact, plantFoot, type FootPlant } from "./gait"
import { walkFoot, WALK_STANCE_FRACTION } from "./pose"
import { inkPersonFrame } from "./ink"

describe("opposite-leg staff walking", () => {
  const designs = [...Object.values(PERSON_PRESETS), ...Array.from({ length: 6 }, (_, i) => populationDesign(TRAVELER_TYPES.peasant, i))]
  it("plants with the opposite foot and pivots behind without sliding", () => {
    for (const design of designs) {
      const b = personRecipe(design).body, stride = 2 * b.stride / WALK_STANCE_FRACTION
      const initial = staffMotion(0, b)
      expect(initial.tip[2]).toBeGreaterThan(0)
      for (let tick = 0; tick < 900; tick++) {
        const phase = tick / 100, pose = staffMotion(phase, b)
        expect(pose.tip[1]).toBeGreaterThanOrEqual(0.025 - 1e-9)
        expect(pose.planted).toBe(walkFoot("left", phase, b).planted)
        if (pose.planted) {
          expect(pose.tip[1]).toBe(0.025)
          expect(pose.tip[2] + pose.phase * stride).toBeCloseTo(initial.tip[2], 10)
        }
      }
      const behind = staffMotion(STAFF_PLANT_END - 0.001, b)
      expect(behind.tip[2]).toBeLessThan(behind.grip[2])
      expect(staffMotion(0.8, b).planted).toBe(false)
      expect(staffMotion(STAFF_STRIDES, b)).toEqual(initial)
      for (const boundary of [STAFF_PLANT_END, STAFF_STRIDES]) {
        const before = staffMotion(boundary - 1e-7, b), after = staffMotion(boundary + 1e-7, b)
        for (const part of ["tip", "grip"] as const) for (let i = 0; i < 3; i++) expect(before[part][i]).toBeCloseTo(after[part][i], 5)
      }
    }
  })

  it("also supports longer authored loops at normal leg speed through pause and carrying", () => {
    let phase = 0
    const frames = []
    for (let tick = 0; tick < 60; tick++) {
      frames.push(walkClipFrame(phase, 60, 3))
      expect(walkClipFrame(phase, 20)).toBe(tick % 20)
      expect(walkContact(phase, 60, personRecipe().body, 3)).toEqual(walkContact(phase % 1, 20, personRecipe().body))
      const paused = advanceWalkPhase(phase, 0, 0, 60, 18, 0.4, true, 3)
      expect(paused).toBe(phase)
      phase = advanceWalkPhase(phase, 0.4 / 20, 1 / 18, 60, 18, 0.4, true, 3)
    }
    expect(frames).toEqual(Array.from({ length: 60 }, (_, i) => i))
    expect(walkClipFrame(phase, 60, 3)).toBe(0)
    expect(advanceWalkPhase(0, 0, 20 / 18, 60, 18, 0.4, false, 3)).toBe(1)
  })

  it("keeps a thin staff at its native pixel width", () => {
    const size = 16, source = new Uint8ClampedArray(size * size * 4), parts = source.slice()
    for (let y = 4; y < 12; y++) {
      source.set([120, 86, 55, 255], (y * size + 8) * 4)
      parts.set([11, 0, 0, 255], (y * size + 8) * 4)
    }
    const result = inkPersonFrame(source, parts, size, [[48, 37, 30], [120, 86, 55]], 0.6)
    expect(result.pixels).toEqual(source)
  })

  it("keeps the displayed staff planted between atlas frames as feet change support", () => {
    const b = personRecipe(PERSON_PRESETS.Traveler).body
    const stride = 2 * b.stride / WALK_STANCE_FRACTION
    let footPlant: FootPlant | null = null, staffAnchor = 0, plantCycle = -1
    for (let tick = 0; tick < 1080; tick++) {
      const phase = tick / 120, framePhase = walkClipFrame(phase, 60, 3) / 20
      const foot = walkContact(phase, 60, b, 3)
      const contact = plantFoot(footPlant, foot.side, { x: 0, z: phase * stride }, { x: foot.x, z: foot.z })
      footPlant = contact.plant
      const staff = staffMotion(framePhase, b)
      if (staff.planted) {
        const worldTip = phase * stride + contact.offset.z + staff.tip[2]
        const cycle = Math.floor(phase)
        if (cycle !== plantCycle) { staffAnchor = worldTip; plantCycle = cycle }
        expect(worldTip).toBeCloseTo(staffAnchor, 10)
      }
    }
  })
})
