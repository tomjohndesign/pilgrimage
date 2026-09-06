import { describe, expect, it } from "vitest"
import * as THREE from "three"
import { poseOffset, setPoseKey, validatePoseEdits, type PoseEdits } from "./pose-edits"
import { DEFAULT_DESIGN, PERSON_PRESETS, personRecipe, validatePersonDesign } from "./design"
import { createBasePersonRig } from "./rig"
import { inspectRig, rigDragDelta } from "./rig-inspection"
import { personCamera } from "./camera"
import { PERSON_CLIPS, type Point3 } from "./pose"
import { staffDimensions } from "./staff-motion"

const distance = (a: Point3, b: Point3) => new THREE.Vector3(...a).distanceTo(new THREE.Vector3(...b))
describe("editable pose keys", () => {
  it("hits authored keys exactly, falls back locally, and blends across the loop seam", () => {
    let edits = setPoseKey(undefined, "walk", "head", { frame: 0, radius: 3, offset: [0.2, 0, 0] }, 0)
    expect(poseOffset(edits, "walk", "head", 0)).toEqual([0.2, 0, 0])
    expect(poseOffset(edits, "walk", "head", 3 / 20)).toEqual([0, 0, 0])
    expect(poseOffset(edits, "walk", "head", 1 / 20)[0]).toBeGreaterThan(0)
    expect(poseOffset(edits, "walk", "head", 19 / 20)[0]).toBeCloseTo(poseOffset(edits, "walk", "head", 1 / 20)[0])
    expect(poseOffset(edits, "walk", "head", 1 - 1e-8)[0]).toBeCloseTo(0.2, 10)
    edits = setPoseKey(edits, "walk", "head", { frame: 2, radius: 3, offset: [-0.1, 0, 0] }, 2)
    expect(poseOffset(edits, "walk", "head", 2 / 20)[0]).toBeCloseTo(-0.1)
    expect(poseOffset(setPoseKey(edits, "walk", "head", null, 0), "walk", "head", 0)[0]).toBeLessThan(0)
  })
  it("round-trips parameters and rejects malformed or out-of-range edits", () => {
    const poseEdits = setPoseKey(undefined, "idle", "head", { frame: 0, radius: 1, offset: [0, 0.1, 0] }, 0)
    const design = { ...DEFAULT_DESIGN, poseEdits }
    expect(validatePersonDesign(JSON.parse(JSON.stringify(design)))).toEqual(design)
    for (const value of [null, { fly: {} }, { walk: { chest: [] } }, { walk: { head: [{ frame: 20, radius: 1, offset: [0, 0, 0] }] } }, { walk: { head: [{ frame: 0, radius: 1, offset: [0, Infinity, 0] }] } }]) expect(() => validatePoseEdits(value)).toThrow()
  })
  it("unprojects pointer motion correctly in every facing", () => {
    const camera = personCamera()
    for (let row = 0; row < 8; row++) {
      const origin = new THREE.Vector3().project(camera)
      const delta = new THREE.Vector3(...rigDragDelta(5, -3, row)).applyAxisAngle(new THREE.Vector3(0, 1, 0), -row * Math.PI / 4).project(camera).sub(origin)
      expect(delta.x * 32).toBeCloseTo(5)
      expect(delta.y * -32).toBeCloseTo(-3)
    }
  })
  it("edits the actual rig without accumulating offsets and keeps arm bones and staff length fixed", () => {
    const base = PERSON_PRESETS.Traveler, b = personRecipe(base).body
    const poseEdits: PoseEdits = { walk: { head: [{ frame: 0, radius: 3, offset: [0.1, 0.05, 0] }], rightHand: [{ frame: 0, radius: 3, offset: [0.02, 0.03, -0.05] }] } }
    const plain = createBasePersonRig(personRecipe(base)), edited = createBasePersonRig(personRecipe({ ...base, poseEdits }))
    try {
      plain.pose(0); edited.pose(0)
      const a = plain.joints(), first = edited.joints()
      expect(first.head![0] - a.head![0]).toBeCloseTo(0.1)
      expect(distance(first.rightHand!, a.rightHand!)).toBeGreaterThan(0.02)
      for (let repeat = 0; repeat < 3; repeat++) {
        for (let frame = 0; frame < 20; frame++) {
          edited.pose(frame / 20)
          const joints = edited.joints()
          expect(distance(joints.rightShoulder!, joints.rightElbow!)).toBeCloseTo(b.upperArmLength)
          expect(distance(joints.staffTip!, joints.staffTop!)).toBeCloseTo(staffDimensions(b).length)
        }
        edited.pose(0); expect(edited.joints()).toEqual(first)
      }
    } finally { plain.dispose(); edited.dispose() }
  })
  it("shows every activity and locks planted feet while allowing swing edits", () => {
    for (const clip of Object.keys(PERSON_CLIPS) as (keyof typeof PERSON_CLIPS)[]) {
      const joints = inspectRig(DEFAULT_DESIGN, clip, 0, 1)
      expect(joints.head?.editable).toBe(true)
      expect(joints.pelvis?.editable).toBe(false)
      for (const joint of Object.values(joints)) expect([...joint.position, ...joint.screen].every(Number.isFinite)).toBe(true)
    }
    expect(inspectRig(DEFAULT_DESIGN, "walk", 0, 1).leftFoot?.editable).toBe(false)
    expect(inspectRig(DEFAULT_DESIGN, "walk", 15, 1).leftFoot?.editable).toBe(true)
  })
  it("extends the staff arm at planting and bends it as the body follows", () => {
    for (const design of [PERSON_PRESETS.Traveler, PERSON_PRESETS.Stout, PERSON_PRESETS.Lanky]) {
      const rig = createBasePersonRig(personRecipe({ ...design, walkingStick: true }))
      try {
        rig.pose(0); const plant = rig.joints()
        rig.pose(0.5); const late = rig.joints()
        const straightness = (j: ReturnType<typeof rig.joints>) => distance(j.rightShoulder!, j.rightHand!) / (distance(j.rightShoulder!, j.rightElbow!) + distance(j.rightElbow!, j.rightHand!))
        expect(straightness(plant)).toBeGreaterThan(0.9)
        expect(straightness(late)).toBeLessThan(0.65)
        expect(plant.rightHand![2]).toBeGreaterThan(plant.rightShoulder![2] + 0.2)
      } finally { rig.dispose() }
    }
  })
})

describe("leg pose authoring", () => {
  it("retains exact leg lengths and planted contacts under extreme edits", async () => {
    const { editedLeg } = await import("./edited-leg")
    const { legPose } = await import("./pose")
    for (const design of Object.values(PERSON_PRESETS)) {
      const b = personRecipe(design).body
      for (const side of ["left", "right"] as const) for (const axis of [0, 1, 2]) for (const sign of [-1, 1]) {
        const offset: Point3 = [0, 0, 0]; offset[axis] = 0.45 * sign
        const keys = Array.from({ length: 20 }, (_, frame) => ({ frame, offset, radius: 3 }))
        const edits: PoseEdits = { walk: { [`${side}Foot`]: keys, [`${side}Knee`]: keys } }
        for (let frame = 0; frame < 20; frame++) {
          const leg = editedLeg(side, frame / 20, "walk", b, edits), base = legPose(side, frame / 20, "walk", b)
          expect(distance(leg.hip, leg.knee)).toBeCloseTo(b.thighLength, 6)
          expect(distance(leg.knee, leg.ankle)).toBeCloseTo(b.shinLength, 6)
          expect(leg.ankle[1]).toBeGreaterThanOrEqual(b.ankleHeight - 1e-8)
          if (base.planted) expect(distance(leg.ankle, base.ankle)).toBeLessThan(1e-8)
        }
      }
    }
  })
})
