import { describe, expect, it } from "vitest"
import { DEFAULT_ENT_DESIGN, entArm, entBody, entPose, entStride, validateEntDesign } from "./ent-rig"
import { FOLIAGE_SPECIES } from "./foliage/design"
import { walkFoot } from "../base-person/pose"
import { advanceEntActor, createEntActors, type EntActor } from "./ent-motion"
import type { GameMap } from "../map/types"

const length = (a: number[], b: number[]) => Math.hypot(...a.map((v, i) => v - b[i]))
const map: GameMap = { width: 80, depth: 80, tiles: Array(6400).fill("forest"), buildings: [] }
function actor(): EntActor {
  const trees = Array.from({ length: 1000 }, () => ({ x: 0, y: .2, z: 0, species: "oak" as const }))
  const a = createEntActors(trees, 42)[0]; a.state.wait = 0; a.state.rng = () => .25
  return a
}
describe("Ent root and branch rig", () => {
  it("keeps both root and arm lengths fixed, knees forward, flat stance feet and a closed loop for all six species", () => {
    for (const species of FOLIAGE_SPECIES) for (const reach of [.6, 1, 1.2]) {
      const design = { ...DEFAULT_ENT_DESIGN, reach }, b = entBody(species, design)
      expect(entPose(species, 0, design)).toEqual(entPose(species, 1, design))
      for (let i = 0; i < 100; i++) {
        const phase = i / 100, pose = entPose(species, phase, design)
        for (const side of ["left", "right"] as const) {
          const leg = pose[side], arm = entArm(side, pose.height, phase, design)
          expect(length(leg.hip, leg.knee)).toBeCloseTo(b.thighLength, 8)
          expect(length(leg.knee, leg.ankle)).toBeCloseTo(b.shinLength, 8)
          expect(length(arm.shoulder, arm.elbow)).toBeCloseTo(.29, 8)
          expect(length(arm.elbow, arm.hand)).toBeCloseTo(.27, 8)
          if (leg.planted) expect(leg.ankle[1]).toBeCloseTo(b.ankleHeight, 8)
          expect(leg.knee[2]).toBeGreaterThan(Math.min(leg.hip[2], leg.ankle[2]))
        }
      }
      const a = walkFoot("left", .2, b), c = walkFoot("left", .3, b)
      expect(c.ankle[2] - a.ankle[2] + entStride(species, design) * .1).toBeCloseTo(0, 10)
      expect(entStride(species, design) / design.seconds).toBeLessThan(.09)
    }
  })
  it("retains contact when a planted foot is edited and preserves arm lengths when a hand is moved", () => {
    const design = validateEntDesign({ ...DEFAULT_ENT_DESIGN, poseEdits: { walk: {
      leftFoot: [{ frame: 4, radius: 4, offset: [.3, .3, .3] }], leftHand: [{ frame: 4, radius: 4, offset: [.2, .1, .1] }],
    } } })
    for (const species of FOLIAGE_SPECIES) {
      expect(length(entPose(species, .2, design).left.ankle, entPose(species, .2).left.ankle)).toBeCloseTo(0, 10)
      const arm = entArm("left", .6, .2, design)
      expect(length(arm.shoulder, arm.elbow)).toBeCloseTo(.29, 8)
      expect(length(arm.elbow, arm.hand)).toBeCloseTo(.27, 8)
    }
    expect(() => validateEntDesign({ ...design, seconds: NaN })).toThrow()
    expect(() => validateEntDesign({ ...design, poseEdits: { sleeping: {} } })).toThrow()
  })
  it("walks by the species stride at six seconds per cycle, pauses exactly, and settles at the new ground position", () => {
    const a = actor()
    advanceEntActor(a, map, 0, 0)
    expect(a.state.phase).toBe("rooted")
    expect(a.y).toBe(.2)
    for (let i = 0; i < 33; i++) advanceEntActor(a, map, .1, 0)
    expect(a.state.phase).toBe("walking")
    const start = a.state.x
    for (let i = 0; i < 60; i++) advanceEntActor(a, map, .1, 0)
    expect(a.state.x - start).toBeCloseTo(entStride("oak"), 8)
    const frozen = [a.state.x, a.state.z, a.phase, a.frame, a.x, a.y, a.z]
    for (let i = 0; i < 20; i++) advanceEntActor(a, map, 0, 0)
    expect([a.state.x, a.state.z, a.phase, a.frame, a.x, a.y, a.z]).toEqual(frozen)
    for (let i = 0; i < 500 && a.state.phase !== "rooted"; i++) advanceEntActor(a, map, .1, 0)
    expect(a.state.phase).toBe("rooted")
    expect(a.visible).toBe(false); expect(a.tree.walking).toBe(false)
    expect(a.x).toBeCloseTo(a.tree.x); expect(a.y).toBeCloseTo(a.tree.y)
    expect(a.phase).toBeCloseTo(Math.round(a.phase), 8)
  })
  it("holds the displayed supporting root in world space between atlas frames and honours woodcutter reservations", () => {
    const a = actor()
    advanceEntActor(a, map, 1, 0, DEFAULT_ENT_DESIGN, true)
    expect(a.state.phase).toBe("rooted")
    for (let i = 0; i < 34; i++) advanceEntActor(a, map, .1, 0)
    const frame = a.frame, anchor = { ...a.plant!.anchor }, position = [a.x, a.y, a.z]
    advanceEntActor(a, map, .01, 0)
    expect(a.frame).toBe(frame)
    expect(a.plant!.anchor).toEqual(anchor)
    expect(length([a.x, a.y, a.z], position)).toBeCloseTo(0, 10)
  })
})
