import { describe, expect, it } from "vitest"
import * as THREE from "three"
import { clearFrameKeys, poseOffset, setPoseKey, validatePoseEdits, type PoseEdits } from "./pose-edits"
import { DEFAULT_DESIGN, PERSON_PRESETS, personRecipe, validatePersonDesign } from "./design"
import { createBasePersonRig } from "./rig"
import { inspectRig, orderJoints, pickBone, pickJoint, rigDragDelta, type InspectedJoint } from "./rig-inspection"
import { personClipBakeKey } from "./bake"
import { personCamera } from "./camera"
import { PERSON_CLIPS, legPose, type Point3 } from "./pose"
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
    for (const value of [null, { fly: {} }, { walk: { staffTop: [] } }, { walk: { head: [{ frame: 20, radius: 1, offset: [0, 0, 0] }] } }, { walk: { head: [{ frame: 0, radius: 1, offset: [0, Infinity, 0] }] } }]) expect(() => validatePoseEdits(value)).toThrow()
  })
  it("returns a whole frame to the generated pose while keeping other frames", () => {
    let edits = setPoseKey(undefined, "walk", "head", { frame: 4, radius: 2, offset: [0.1, 0, 0] }, 4)
    edits = setPoseKey(edits, "walk", "leftHand", { frame: 4, radius: 2, offset: [0, 0.1, 0] }, 4)
    edits = setPoseKey(edits, "walk", "leftHand", { frame: 9, radius: 2, offset: [0, 0.2, 0] }, 9)
    const cleared = clearFrameKeys(edits, "walk", 4)
    expect(cleared.walk?.head).toEqual([])
    expect(cleared.walk?.leftHand).toEqual([{ frame: 9, radius: 2, offset: [0, 0.2, 0] }])
    expect(poseOffset(cleared, "walk", "head", 4 / 20)).toEqual([0, 0, 0])
    expect(clearFrameKeys(undefined, "idle", 0)).toEqual({})
  })
  it("keys one clip's sheet to that clip's own pose edits only", () => {
    const design = { ...DEFAULT_DESIGN, poseEdits: setPoseKey(undefined, "walk", "head", { frame: 0, radius: 1, offset: [0.1, 0, 0] }, 0) }
    expect(personClipBakeKey(design, "idle")).toBe(personClipBakeKey(DEFAULT_DESIGN, "idle"))
    expect(personClipBakeKey(design, "walk")).not.toBe(personClipBakeKey(DEFAULT_DESIGN, "walk"))
    expect(personClipBakeKey(design, "walk")).not.toBe(personClipBakeKey(design, "idle"))
    expect(personClipBakeKey({ ...design, hands: design.hands + 0.1 }, "idle")).not.toBe(personClipBakeKey(design, "idle"))
  })
  it("picks the editable handle under a pointer over covering skeleton nodes and stacks near joints last", () => {
    const joints: Partial<Record<"leftHand" | "rightHand" | "chest" | "pelvis", InspectedJoint>> = {
      chest: { position: [0, 0, 0], screen: [32, 30], editable: false, depth: 0.2 },
      leftHand: { position: [0, 0, 0], screen: [32, 30.6], editable: true, depth: 0.5 },
      rightHand: { position: [0, 0, 0], screen: [33, 31], editable: true, depth: 0.1 },
      pelvis: { position: [0, 0, 0], screen: [32, 40], editable: false, depth: 0.2 },
    }
    expect(pickJoint(joints, 32, 30, 2.5)).toBe("leftHand")
    expect(pickJoint(joints, 33.2, 31, 2.5)).toBe("rightHand")
    expect(pickJoint(joints, 32, 40, 2.5)).toBe("pelvis")
    expect(pickJoint(joints, 32, 38.5, 2.5)).toBe("pelvis") // A grey node clearly under the pointer still wins.
    expect(pickJoint(joints, 10, 10, 2.5)).toBeNull()
    expect(orderJoints(joints).map(([name]) => name)).toEqual(["chest", "pelvis", "leftHand", "rightHand"])
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
  it("poses the skeleton's own joints: pelvis carries the body, chest carries head and arms, hips and shoulders move their limbs", () => {
    const base = PERSON_PRESETS.Traveler, b = personRecipe(base).body
    const key = (offset: Point3) => [{ frame: 0, radius: 3, offset }]
    const plain = createBasePersonRig(personRecipe(base))
    const posed = (poseEdits: PoseEdits) => createBasePersonRig(personRecipe({ ...base, poseEdits }))
    const rigs = [plain]
    try {
      plain.pose(0, "walk"); const a = plain.joints()
      const pelvis = posed({ walk: { pelvis: key([0, -0.04, 0.01]) } }); rigs.push(pelvis); pelvis.pose(0, "walk"); const p = pelvis.joints()
      for (const joint of ["pelvis", "chest", "head", "leftShoulder", "leftHip", "rightHip"] as const) p[joint]!.forEach((v, i) => expect(v - a[joint]![i]).toBeCloseTo([0, -0.04, 0.01][i], 6))
      expect(distance(p.leftFoot!, a.leftFoot!)).toBeLessThan(1e-6) // Planted feet stay on the ground.
      // A pull the support leg cannot follow is shortened rather than lifting the planted foot.
      const stretch = posed({ walk: { pelvis: key([0.3, 0.2, 0.3]) } }); rigs.push(stretch); stretch.pose(0, "walk"); const st = stretch.joints()
      expect(distance(st.leftFoot!, a.leftFoot!)).toBeLessThan(1e-6)
      expect(st.pelvis![1]).toBeGreaterThan(a.pelvis![1]); expect(st.pelvis![1] - a.pelvis![1]).toBeLessThan(0.2)
      expect(distance(st.leftHip!, st.leftFoot!)).toBeLessThanOrEqual(b.thighLength + b.shinLength)
      const chest = posed({ walk: { chest: key([0, 0.04, 0.06]) } }); rigs.push(chest); chest.pose(0, "walk"); const c = chest.joints()
      for (const joint of ["chest", "head", "leftShoulder", "rightShoulder"] as const) c[joint]!.forEach((v, i) => expect(v - a[joint]![i]).toBeCloseTo([0, 0.04, 0.06][i], 6))
      expect(c.pelvis).toEqual(a.pelvis)
      const shoulder = posed({ walk: { rightShoulder: key([-0.05, 0.03, 0]) } }); rigs.push(shoulder); shoulder.pose(0, "walk"); const sh = shoulder.joints()
      sh.rightShoulder!.forEach((v, i) => expect(v - a.rightShoulder![i]).toBeCloseTo([-0.05, 0.03, 0][i], 6))
      expect(sh.leftShoulder).toEqual(a.leftShoulder)
      // A hip key moves a swinging leg's root freely; on a planted leg it is shortened so the foot stays down.
      const swingKey = [{ frame: 15, radius: 3, offset: [0.03, 0, -0.03] as Point3 }]
      const hip = posed({ walk: { leftHip: swingKey } }); rigs.push(hip)
      plain.pose(15 / 20, "walk"); const a15 = plain.joints(); hip.pose(15 / 20, "walk"); const h = hip.joints()
      h.leftHip!.forEach((v, i) => expect(v - a15.leftHip![i]).toBeCloseTo([0.03, 0, -0.03][i], 6))
      expect(distance(h.leftFoot!, a15.leftFoot!)).toBeLessThan(1e-6)
      const plantedHip = posed({ walk: { leftHip: key([0.3, 0.3, 0]) } }); rigs.push(plantedHip); plantedHip.pose(0, "walk"); const ph = plantedHip.joints()
      expect(distance(ph.leftFoot!, a.leftFoot!)).toBeLessThan(1e-6)
      expect(distance(ph.leftHip!, ph.leftFoot!)).toBeLessThanOrEqual(b.thighLength + b.shinLength)
      for (const joints of [p, st, c, sh, h, ph]) for (const side of ["left", "right"] as const) {
        expect(distance(joints[`${side}Hip`]!, joints[`${side}Knee`]!)).toBeCloseTo(b.thighLength, 6)
        expect(distance(joints[`${side}Knee`]!, joints[`${side}Foot`]!)).toBeCloseTo(b.shinLength, 6)
        expect(distance(joints[`${side}Shoulder`]!, joints[`${side}Elbow`]!)).toBeCloseTo(b.upperArmLength, 6)
      }
      for (const rig of rigs.slice(1)) { rig.pose(0.3, "walk"); rig.pose(0, "walk") }
      expect(pelvis.joints()).toEqual(p); expect(chest.joints()).toEqual(c) // No accumulation across poses.
    } finally { rigs.forEach(rig => rig.dispose()) }
  })
  it("picks the bone under the pointer only when no handle is", () => {
    const joints: Partial<Record<"a" | "b" | "c", InspectedJoint>> = {
      a: { position: [0, 0, 0], screen: [10, 10], editable: true }, b: { position: [0, 0, 0], screen: [30, 10], editable: true }, c: { position: [0, 0, 0], screen: [30, 30], editable: false },
    }
    const bones: [ "a" | "b" | "c", "a" | "b" | "c"][] = [["a", "b"], ["b", "c"]]
    expect(pickBone(joints, bones, 20, 10.8, 1.2)).toEqual(["a", "b"])
    expect(pickBone(joints, bones, 29.5, 20, 1.2)).toEqual(["b", "c"])
    expect(pickBone(joints, bones, 20, 13, 1.2)).toBeNull()
    expect(pickBone(joints, bones, 45, 10, 1.2)).toBeNull() // Beyond the segment's end.
  })
  it("reports leg handles at the rig's actual hip, knee and ankle", () => {
    const rig = createBasePersonRig(personRecipe(DEFAULT_DESIGN)), b = personRecipe(DEFAULT_DESIGN).body
    try {
      for (const frame of [0, 7, 13]) {
        rig.view(0); rig.pose(frame / 20, "walk")
        const joints = rig.joints()
        for (const side of ["left", "right"] as const) {
          const leg = legPose(side, frame / 20, "walk", b)
          expect(distance(joints[`${side}Hip`]!, leg.hip)).toBeLessThan(1e-6)
          expect(distance(joints[`${side}Knee`]!, leg.knee)).toBeLessThan(1e-6)
          expect(distance(joints[`${side}Foot`]!, leg.ankle)).toBeLessThan(1e-6)
        }
      }
    } finally { rig.dispose() }
  })
  it("shows every activity and locks planted feet while allowing swing edits", () => {
    for (const clip of Object.keys(PERSON_CLIPS) as (keyof typeof PERSON_CLIPS)[]) {
      const joints = inspectRig(DEFAULT_DESIGN, clip, 0, 1)
      expect(joints.head?.editable).toBe(true)
      expect(joints.pelvis?.editable).toBe(true)
      expect(joints.chest?.editable).toBe(true)
      for (const joint of Object.values(joints)) expect([...joint.position, ...joint.screen].every(Number.isFinite)).toBe(true)
    }
    expect(inspectRig(DEFAULT_DESIGN, "walk", 0, 1).leftFoot?.editable).toBe(false)
    expect(inspectRig(DEFAULT_DESIGN, "walk", 15, 1).leftFoot?.editable).toBe(true)
    expect(inspectRig(DEFAULT_DESIGN, "procession", 0, 1).leftFoot?.editable).toBe(false)
    expect(inspectRig(DEFAULT_DESIGN, "procession", 15, 1).leftFoot?.editable).toBe(true)
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
      for (const clip of ["walk", "procession"] as const) for (const side of ["left", "right"] as const) for (const axis of [0, 1, 2]) for (const sign of [-1, 1]) {
        const offset: Point3 = [0, 0, 0]; offset[axis] = 0.45 * sign
        const keys = Array.from({ length: 20 }, (_, frame) => ({ frame, offset, radius: 3 }))
        const edits: PoseEdits = { [clip]: { [`${side}Foot`]: keys, [`${side}Knee`]: keys } }
        for (let frame = 0; frame < 20; frame++) {
          const leg = editedLeg(side, frame / 20, clip, b, edits), base = legPose(side, frame / 20, clip, b)
          expect(distance(leg.hip, leg.knee)).toBeCloseTo(b.thighLength, 6)
          expect(distance(leg.knee, leg.ankle)).toBeCloseTo(b.shinLength, 6)
          expect(leg.ankle[1]).toBeGreaterThanOrEqual(b.ankleHeight - 1e-8)
          if (base.planted) expect(distance(leg.ankle, base.ankle)).toBeLessThan(1e-8)
        }
      }
    }
  })
})
