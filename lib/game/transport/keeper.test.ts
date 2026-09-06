import { describe, expect, it } from "vitest"
import { keeperRoutine } from "./keeper"
import { SMALL_STALL, STALL, KEEPER_SEAT, pastureSegmentClear, stallObstacles, stallPoint } from "./stall"
import { merchantWalkSpeed, CARGO, RIG_TO_WORLD } from "./assets"
import { personWalkStride } from "../base-person/gait"
import { populationDesign } from "../base-person/population"
import { TRAVELER_TYPES } from "../travelers"
import { createCartRig } from "./rig"
import { createBasePersonRig } from "../base-person/rig"
import { personRecipe } from "../base-person/design"
import { merchantGesture } from "./merchant-poses"
import * as THREE from "three"

describe("merchant stall routine", () => {
  it("gives the hand-pulled merchant a smaller spread and slower travel", () => {
    expect(SMALL_STALL.display.length).toBeLessThan(STALL.display.length / 2)
    const stride = personWalkStride(populationDesign(TRAVELER_TYPES.vendor, 0)) * 1.5
    expect(merchantWalkSpeed("hand", 1.5, stride)).toBeCloseTo(stride * 0.7)
    expect(merchantWalkSpeed("hand", 1.5, stride)).toBeLessThan(merchantWalkSpeed("donkey", 1.5, stride))
  })
  it("walks continuously, gestures, returns to the same seat and repeats without walking through wares", () => {
    for (const puller of ["hand", "donkey", "horse"] as const) {
      const stride = personWalkStride(populationDesign(TRAVELER_TYPES.vendor, 0)) * 1.5
      const poses = new Set<string>(), obstacles = stallObstacles({ x: 0, z: 0 }, 0, 1, 1.5, puller)
      let previous = keeperRoutine(0, puller, 1.5, stride), returns = 0
      for (let frame = 1; frame < 3600; frame++) {
        const next = keeperRoutine(frame / 60, puller, 1.5, stride)
        const distance = Math.hypot(next.x - previous.x, next.z - previous.z) * RIG_TO_WORLD * 1.5
        expect(distance).toBeLessThanOrEqual(stride * 0.7 / 60 + 1e-8)
        const p = stallPoint({ x: 0, z: 0 }, 0, 1, 1.5, next)
        expect(pastureSegmentClear(p, p, obstacles, 0.04)).toBe(true)
        if (next.pose === "sit") expect([next.x, next.z]).toEqual([KEEPER_SEAT.x, KEEPER_SEAT.z])
        if (next.pose === "sit" && previous.pose !== "sit") returns++
        poses.add(next.pose); previous = next
      }
      expect(poses).toEqual(new Set(["wave", "walk", "offer", "sit"]))
      expect(returns).toBeGreaterThanOrEqual(2)
      expect(keeperRoutine(1, puller, 1.5, stride, false).pose).toBe("idle")
    }
  })
  it("moves the greeting arms while retaining the shared planted legs and closes the pose", () => {
    const rig = createBasePersonRig(personRecipe(populationDesign(TRAVELER_TYPES.vendor, 0)))
    try {
      for (const gesture of ["wave", "offer"] as const) {
        const positions: number[][] = []
        for (const phase of [0, 0.45, 1]) {
          rig.pose(0, "idle"); merchantGesture(rig.root, gesture, phase)
          const foot = rig.root.getObjectByName("left-foot")!.getWorldPosition(new THREE.Vector3())
          const hand = rig.sockets.leftHand.getWorldPosition(new THREE.Vector3())
          positions.push([...foot.toArray(), ...hand.toArray()])
        }
        expect(positions[0].slice(0, 3)).toEqual(positions[1].slice(0, 3))
        expect(positions[0].slice(3)).not.toEqual(positions[1].slice(3))
        positions[0].forEach((value, i) => expect(positions[2][i]).toBeCloseTo(value, 10))
      }
    } finally { rig.dispose() }
  })
  it("transfers each offering between cart and ground exactly once, in both directions", () => {
    for (const cargo of CARGO) for (const compact of [false, true]) {
      const rig = createCartRig(cargo, "shop", compact), count = compact ? 3 : 6
      try {
        for (const progress of [0, 0.5, 0.6, 0.7, 0.8, 0.9, 1, 0.9, 0.6, 0]) {
          rig.pose(0, progress)
          const loaded = new Set<number>(), spread = new Set<number>()
          rig.root.traverse(o => {
            if (o.visible && o.userData.cargoItem !== undefined) loaded.add(o.userData.cargoItem)
            if (o.visible && o.userData.displayItem !== undefined) spread.add(o.userData.displayItem)
          })
          expect(loaded.size + spread.size).toBe(count)
          for (const item of loaded) expect(spread.has(item)).toBe(false)
          if (progress === 1) expect(loaded.size).toBe(0)
          if (progress === 0) expect(spread.size).toBe(0)
        }
      } finally { rig.dispose() }
    }
  })
})
