import { describe, expect, it } from "vitest"
import * as THREE from "three"
import { poseDriver, DRIVER_GRIP, DRIVER_HIP, DRIVER_CLIP, driverPoint, reinPoints } from "./driver"
import { CART, DRIVER_SEAT } from "./assets"
import { animalBit } from "./bridle"
import { createBasePersonRig } from "../base-person/rig"
import { personRecipe } from "../base-person/design"
import { populationDesign } from "../base-person/population"
import { TRAVELER_TYPES } from "../travelers"
import { createAnimalRig, createCartRig } from "./rig"

describe("seated wagon drivers", () => {
  it("keeps every outfit's knees below the hips, boots hanging, and both hands on the reins", () => {
    for (let variant = 0; variant < 6; variant++) {
      const design = populationDesign(TRAVELER_TYPES.vendor, variant), recipe = personRecipe(design), rig = createBasePersonRig(recipe)
      try {
        for (let row = 0; row < 8; row++) {
          rig.view(row); rig.pose(0, "idle"); poseDriver(rig, design)
          const joints = rig.joints()
          for (const side of ["left", "right"] as const) {
            const hip = new THREE.Vector3(...joints[`${side}Hip`]!), knee = new THREE.Vector3(...joints[`${side}Knee`]!), foot = new THREE.Vector3(...joints[`${side}Foot`]!)
            expect(knee.y).toBeLessThan(hip.y)
            expect(foot.y).toBeLessThan(knee.y - 0.25)
            expect(hip.distanceTo(knee)).toBeCloseTo(recipe.body.thighLength, 9)
            expect(knee.distanceTo(foot)).toBeCloseTo(recipe.body.shinLength, 9)
            expect(knee.z).toBeGreaterThan(hip.z + 0.25)
            const hand = joints[`${side}Hand`]!
            const expected = [(side === "left" ? 1 : -1) * DRIVER_GRIP.x, DRIVER_GRIP.y, DRIVER_GRIP.z]
            hand.forEach((value, i) => expect(value).toBeCloseTo(expected[i], 9))
          }
        }
      } finally { rig.dispose() }
    }
  })
  it("supports the driver's hips on a full-width bench with a backrest", () => {
    for (const kind of ["horse", "donkey"] as const) {
      const cart = createCartRig("produce", kind)
      try {
        cart.root.updateMatrixWorld(true)
        const bounds = new THREE.Box3().setFromObject(cart.root.getObjectByName("driver-bench")!)
        expect(bounds.max.x - bounds.min.x).toBeGreaterThan(1.2)
        expect(bounds.max.x - bounds.min.x).toBeLessThan(1.4)
        expect(bounds.max.z - bounds.min.z).toBeGreaterThan(0.85)
        expect(DRIVER_SEAT.z).toBeGreaterThan(bounds.min.z)
        expect(DRIVER_SEAT.z).toBeLessThan(bounds.max.z)
        // The underside of the thighs rests on the seat, with no air gap.
        expect(DRIVER_SEAT.y + DRIVER_HIP - 0.09).toBeCloseTo(bounds.max.y, 6)
        expect(cart.root.getObjectByName("driver-backrest")).toBeDefined()
      } finally { cart.dispose() }
    }
  })
  it("registers the driver and rein sockets to the cart at all sixteen turning angles", () => {
    expect(DRIVER_CLIP.directions).toBe(CART.directions)
    expect(DRIVER_CLIP.cellSize).toBe(CART.cellSize)
    expect(DRIVER_CLIP.anchor).toEqual(CART.anchor)
    const cart = new THREE.Object3D(), seat = new THREE.Object3D()
    seat.position.set(DRIVER_SEAT.x, DRIVER_SEAT.y, DRIVER_SEAT.z); cart.add(seat)
    for (let row = 0; row < CART.directions; row++) for (const scale of [1, 1.5, 2]) {
      const heading = -row * Math.PI * 2 / CART.directions
      cart.rotation.y = heading; cart.scale.setScalar(scale); cart.position.set(5, 0.8, -3)
      cart.updateMatrixWorld(true)
      for (const side of [-1, 1]) {
        const grip: [number, number, number] = [side * DRIVER_GRIP.x, DRIVER_GRIP.y, DRIVER_GRIP.z]
        const socket = seat.localToWorld(new THREE.Vector3(...grip))
        const rendered = new THREE.Vector3(...driverPoint(grip, heading)).multiplyScalar(scale).add(cart.position)
        expect(rendered.distanceTo(socket)).toBeLessThan(1e-12)
      }
    }
  })
  it("attaches both reins to the articulated bridle throughout each animal's walk", () => {
    for (const [kind, variant] of [["horse", "common"], ["horse", "noble"], ["donkey", "common"]] as const) {
      const animal = createAnimalRig(kind, variant, undefined, true)
      try {
        for (const moving of [true, false]) for (const phase of [0, 0.15, 0.5, 0.85]) {
          animal.pose(phase, moving); animal.root.updateMatrixWorld(true)
          for (const side of [-1, 1]) {
            const bit = animal.root.getObjectByName(side === 1 ? "left-bit" : "right-bit")!.getWorldPosition(new THREE.Vector3())
            animalBit(kind, variant, phase, moving, side).forEach((value, i) => expect(value).toBeCloseTo(bit.toArray()[i], 9))
            const hand: [number, number, number] = [side * 0.23, 1.5, -1]
            const points = reinPoints(hand, bit.toArray())
            expect(points[0]).toEqual(hand)
            points.at(-1)!.forEach((v, i) => expect(v).toBeCloseTo(bit.toArray()[i], 9))
            expect(points[6][1]).toBeLessThan((hand[1] + bit.y) / 2)
          }
        }
      } finally { animal.dispose() }
    }
  })
})
