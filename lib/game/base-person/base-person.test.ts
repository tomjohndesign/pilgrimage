import { describe, it, expect } from "vitest"
import * as THREE from "three"
import { BASE_PERSON, armAngle, legPose, type Point3 } from "./pose"
import { DEFAULT_DESIGN, PERSON_PRESETS, personRecipe } from "./design"
import { createBasePersonRig } from "./rig"

const length = (a: Point3, b: Point3) => Math.hypot(...a.map((v, i) => v - b[i]))

describe("shared person template", () => {
  it("never stretches either leg or lifts a planted foot across a complete walk", () => {
    for (let step = 0; step < 240; step++) for (const side of ["left", "right"] as const) {
      const pose = legPose(side, step / 240, "walk")
      expect(length(pose.hip, pose.knee)).toBeCloseTo(BASE_PERSON.body.thighLength, 10)
      expect(length(pose.knee, pose.ankle)).toBeCloseTo(BASE_PERSON.body.shinLength, 10)
      if (pose.planted) expect(pose.ankle[1]).toBe(BASE_PERSON.body.ankleHeight)
    }
  })
  it("keeps the anatomical sides and alternates opposing limbs", () => {
    for (let i = 0; i < 8; i++) {
      expect(legPose("left", i / 8, "walk").ankle[0]).toBeGreaterThan(0)
      expect(legPose("right", i / 8, "walk").ankle[0]).toBeLessThan(0)
      expect(armAngle("left", i / 8, "walk")).toBe(-armAngle("right", i / 8, "walk"))
    }
  })
  it("closes the loop exactly and holds a fixed idle", () => {
    for (const side of ["left", "right"] as const) {
      expect(legPose(side, 0, "walk")).toEqual(legPose(side, 1, "walk"))
      expect(legPose(side, 0, "idle")).toEqual(legPose(side, 0.7, "idle"))
    }
  })
  it("keeps head and hip sockets registered; attached objects follow the same hand in every view", () => {
    const recipe = personRecipe()
    const rig = createBasePersonRig(recipe)
    const accessory = new THREE.Object3D()
    rig.attach("leftHand", accessory)
    const head = new THREE.Vector3(), hand = new THREE.Vector3(), attached = new THREE.Vector3()
    try {
      for (let row = 0; row < 8; row++) for (let frame = 0; frame < 8; frame++) {
        rig.root.rotation.y = -row * Math.PI / 4
        rig.pose(frame / 8)
        rig.sockets.head.getWorldPosition(head)
        expect(head.y).toBe(recipe.body.headCenter + recipe.body.headHeight + 0.02)
        expect(rig.sockets.leftHip.position.x).toBeGreaterThan(0)
        expect(rig.sockets.rightHip.position.x).toBeLessThan(0)
        rig.sockets.leftHand.getWorldPosition(hand)
        accessory.getWorldPosition(attached)
        expect(attached.distanceTo(hand)).toBeLessThan(1e-10)
        expect(accessory.parent).toBe(rig.sockets.leftHand)
      }
    } finally { rig.dispose() }
  })
  it("keeps tunic-covered legs clipped in the artwork and both diagnostics", () => {
    const recipe = personRecipe(), rig = createBasePersonRig(recipe)
    const legs: THREE.Mesh[] = []
    rig.root.traverse(object => { if (object instanceof THREE.Mesh && object.userData.clipAboveHem) legs.push(object) })
    try {
      expect(legs).toHaveLength(4)
      for (const debug of [false, true]) for (const mask of [false, true]) {
        rig.trackSides(debug)
        if (mask) rig.inkMask(true)
        for (const leg of legs) {
          const plane = (leg.material as THREE.Material).clippingPlanes?.[0]
          expect(plane).toBeDefined()
          expect(plane!.distanceToPoint(new THREE.Vector3(0, recipe.body.tunicHem + 0.05, 0))).toBeLessThan(0)
          expect(plane!.distanceToPoint(new THREE.Vector3(0, recipe.body.tunicHem - 0.05, 0))).toBeGreaterThan(0)
        }
        if (mask) rig.inkMask(false)
      }
    } finally { rig.dispose() }
  })

  it("dresses both arms to the wrist and preserves outfit layers through every pose", () => {
    for (const design of [DEFAULT_DESIGN, PERSON_PRESETS.Female]) {
      const recipe = personRecipe(design), rig = createBasePersonRig(recipe)
      const female = design.bodyType === "Female"
      try {
        for (const side of ["left", "right"]) {
          const sleeve = rig.root.getObjectByName(`${side}-lower-sleeve`) as THREE.Mesh
          sleeve.geometry.computeBoundingBox()
          expect(sleeve.geometry.boundingBox!.min.y).toBeCloseTo(-recipe.body.forearmLength)
          expect((sleeve.material as THREE.MeshLambertMaterial).color.getHexString()).toBe((female ? design.shirtColor : design.tunicColor).slice(1))
        }
        expect(!!rig.root.getObjectByName("head-covering")).toBe(female)
        const body = rig.root.getObjectByName(female ? "sleeveless-dress" : "shirt") as THREE.Mesh
        if (female) expect(new Set(body.geometry.groups.map(group => group.materialIndex))).toEqual(new Set([0, 1]))
        const legs: THREE.Mesh[] = []
        rig.root.traverse(object => { if (object instanceof THREE.Mesh && object.userData.clipAboveHem) legs.push(object) })
        expect(legs).toHaveLength(female ? 6 : 4)
        for (let row = 0; row < 8; row++) for (let frame = 0; frame < 8; frame++) {
          rig.view(row); rig.pose(frame / 8)
          for (const debug of [false, true]) {
            rig.trackSides(debug); rig.inkMask(true)
            for (const leg of legs) expect((leg.material as THREE.Material).clippingPlanes?.[0]).toBeDefined()
            rig.inkMask(false)
          }
        }
        rig.pose(0)
        const first = Array.from(body.geometry.getAttribute("position").array)
        rig.pose(1)
        Array.from(body.geometry.getAttribute("position").array).forEach((value, i) => expect(value).toBeCloseTo(first[i], 12))
      } finally { rig.dispose() }
    }
  })

  it("closes the shirt around the neck even with raised or lowered arm roots", () => {
    for (const preset of [DEFAULT_DESIGN, PERSON_PRESETS.Stout, PERSON_PRESETS.Female]) {
      for (const shoulderHeight of [0.8, 1.15]) {
        const recipe = personRecipe({ ...preset, shoulderHeight }), rig = createBasePersonRig(recipe)
        try {
          rig.pose(0)
          const torso = rig.root.getObjectByName(preset.bodyType === "Female" ? "sleeveless-dress" : "shirt")!
          // Rays through the previously open annulus must land on shoulder cloth,
          // rather than pass into the body and out through its back or bottom.
          for (const x of [-0.12, 0.12]) for (const z of [-0.06, 0.06]) {
            const ray = new THREE.Raycaster(new THREE.Vector3(x, recipe.body.torsoShoulderHeight + 0.3, z), new THREE.Vector3(0, -1, 0))
            const hits = ray.intersectObject(torso)
            expect(hits.length).toBeGreaterThan(0)
            expect(hits[0].point.y).toBeGreaterThan(recipe.body.torsoShoulderHeight)
          }
        } finally { rig.dispose() }
      }
    }
  })

})
