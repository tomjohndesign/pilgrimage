import { describe, expect, it } from "vitest"
import { wildlifePose, speciesGaits, gaitRecipe, gaitFoot } from "./gait"
import { WILDLIFE_PROFILES } from "./species"
import { MAMMAL_ANATOMY, limbBones } from "./anatomy"

describe("species gaits", () => {
  for (const kind of ["deer", "buck", "sheep", "goat", "rabbit", "fox", "boar"] as const) for (const gait of speciesGaits(kind)) {
    it(`${kind} ${gait} keeps bones fixed, feet clear and contacts speed-matched`, () => {
      const g = gaitRecipe(kind, gait)
      for (let i = 0; i < 120; i++) {
        const phase = i / 120, pose = wildlifePose(kind, gait, phase)
        pose.legs.forEach((leg, limb) => {
          const anatomy = MAMMAL_ANATOMY[kind], bones = limbBones(limb >= 2 ? anatomy.hind : anatomy.front)
          const distance = (a: number[], b: number[]) => Math.hypot(...a.map((n, j) => n - b[j]))
          expect(distance(leg.hip, leg.upperJoint)).toBeCloseTo(bones.upper, 6)
          expect(distance(leg.upperJoint, leg.knee)).toBeCloseTo(bones.middle, 6)
          expect(distance(leg.knee, leg.ankle)).toBeCloseTo(bones.cannon, 6)
          expect(leg.ankle[1]).toBeGreaterThanOrEqual((limb >= 2 ? anatomy.hind : anatomy.front).points[3][1] - .0001)
          const local = ((phase - g.contacts[limb]) % 1 + 1) % 1
          if (local > 0.01 && local < g.stance - 0.01) {
            const next = gaitFoot(kind, gait, phase + 0.001, limb)
            expect(next.ankle[2] - leg.ankle[2] + g.stride * 0.001).toBeCloseTo(0, 7)
          }
        })
      }
    })
  }
  it("folds into resting poses without stretching or popping through unreachable joints", () => {
    for (const kind of ["fox", "boar"] as const) for (let i = 0; i <= 100; i++) expect(() => wildlifePose(kind, "walk", 0, 0, i / 100)).not.toThrow()
  })
})

describe("edited gait safety", () => {
  it("keeps edited contacts and swing feet reachable at the slider limits", () => {
    for (const kind of ["deer", "rabbit", "fox", "boar", "sheep", "goat"] as const) for (const gait of speciesGaits(kind)) {
      for (const sign of [-1, 1]) {
        const edits: import("./rig-edits").AnimalRigEdits = { version: 1, clips: { [gait]: { cadence: 2, contacts: [0.08 * sign, -0.08 * sign, 0.08 * sign, -0.08 * sign], keys: { leftHand: [{ frame: 10, radius: 10, offset: [0.45, 0.45, 0.45] }], rightFoot: [{ frame: 10, radius: 10, offset: [-0.45, -0.45, -0.45] }] } } } }
        for (let frame = 0; frame < 80; frame++) for (const amount of [0, 0.5, 1]) {
          const pose = wildlifePose(kind, gait, frame / 80, amount, 0, edits)
          expect(pose.legs.every(leg => [...leg.hip, ...leg.knee, ...leg.ankle].every(Number.isFinite))).toBe(true)
          expect(pose.legs.every((leg, limb) => leg.ankle[1] >= (limb >= 2 ? MAMMAL_ANATOMY[kind].hind : MAMMAL_ANATOMY[kind].front).points[3][1] - .001)).toBe(true)
        }
      }
    }
  })
  it("closes every gait loop without a position discontinuity", () => {
    for (const kind of ["deer", "rabbit", "fox", "boar", "sheep", "goat"] as const) for (const gait of speciesGaits(kind)) {
      const before = wildlifePose(kind, gait, 1 - 1e-6), after = wildlifePose(kind, gait, 1e-6)
      for (let limb = 0; limb < 4; limb++) for (const joint of ["hip", "upperJoint", "knee", "ankle"] as const) {
        expect(Math.hypot(...before.legs[limb][joint].map((value, axis) => value - after.legs[limb][joint][axis]))).toBeLessThan(0.001)
      }
    }
  })
})
