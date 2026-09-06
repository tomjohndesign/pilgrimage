import { describe, expect, it } from "vitest"
import * as THREE from "three"
import { ACTION_CLIPS, legPose, type Point3 } from "./pose"
import { createBasePersonRig } from "./rig"
import { PERSON_PRESETS, personRecipe } from "./design"
import { POPULATION_PROFILES, populationDesign } from "./population"
import { TRAVELER_TYPES } from "../travelers"

const distance = (a: Point3, b: Point3) => Math.hypot(...a.map((v, i) => v - b[i]))

describe("activity rig", () => {
  it("keeps leg lengths fixed across seated, kneeling, gathering and carrying profiles", () => {
    for (let profile = 0; profile < POPULATION_PROFILES.length; profile++) {
      const b = personRecipe(populationDesign(TRAVELER_TYPES.peasant, profile)).body
      for (const clip of ACTION_CLIPS) for (const side of ["left", "right"] as const) for (let f = 0; f < 8; f++) {
        const leg = legPose(side, f / 8, clip, b)
        expect(distance(leg.hip, leg.knee)).toBeCloseTo(b.thighLength, 8)
        expect(distance(leg.knee, leg.ankle)).toBeCloseTo(b.shinLength, 8)
      }
    }
  })
  it("loops cyclic actions and restores the neutral body, clothing and attachments", () => {
    for (const profile of [0, 3]) {
      const rig = createBasePersonRig(personRecipe(populationDesign(TRAVELER_TYPES.peasant, profile)))
      const position = () => Object.values(rig.sockets).map(socket => socket.getWorldPosition(new THREE.Vector3()).toArray())
      try {
        rig.pose(0, "idle")
        const rest = position()
        for (const clip of ACTION_CLIPS) {
          rig.pose(0, clip)
          const first = position()
          if (clip !== "hoisting") {
            rig.pose(1, clip)
            position().forEach((p, i) => p.forEach((v, j) => expect(v).toBeCloseTo(first[i][j], 8)))
          }
          expect(rig.root.getObjectByName("woodcutting-axe")!.visible).toBe(clip === "woodcutting" || clip === "treeFelling")
          rig.pose(0, "idle")
          expect(position()).toEqual(rest)
        }
      } finally { rig.dispose() }
    }
  })
  it("lies below standing height and brings prayer hands together", () => {
    const rig = createBasePersonRig()
    try {
      rig.pose(0, "sleeping")
      expect(rig.sockets.head.getWorldPosition(new THREE.Vector3()).y).toBeLessThan(0.4)
      rig.pose(0, "praying")
      const left = rig.sockets.leftHand.getWorldPosition(new THREE.Vector3())
      const right = rig.sockets.rightHand.getWorldPosition(new THREE.Vector3())
      expect(left.distanceTo(right)).toBeLessThan(0.1)
    } finally { rig.dispose() }
  })
})

describe("overhead relic grip", () => {
  it("raises both palms and keeps the walking leg pose and fixed arm lengths", () => {
    for (const design of [PERSON_PRESETS.Monk, ...[0, 3].map(profile => populationDesign(TRAVELER_TYPES.peasant, profile))]) {
      const recipe = personRecipe(design)
      const rig = createBasePersonRig(recipe)
      try {
        rig.pose(0, "hoisting")
        const low = rig.sockets.leftHand.getWorldPosition(new THREE.Vector3()).y
        rig.pose(15 / 16, "hoisting")
        const high = rig.sockets.leftHand.getWorldPosition(new THREE.Vector3()).y
        expect(high - low).toBeGreaterThan(0.6)
        for (let frame = 0; frame < 20; frame++) {
          rig.pose(frame / 20, "procession")
          for (const side of ["left", "right"] as const) {
            expect(legPose(side, frame / 20, "procession", recipe.body)).toEqual(legPose(side, frame / 20, "walk", recipe.body))
            const shoulder = rig.root.getObjectByName(`${side}-shoulder`)!.getWorldPosition(new THREE.Vector3())
            const elbow = rig.root.getObjectByName(`${side}-elbow`)!.getWorldPosition(new THREE.Vector3())
            expect(shoulder.distanceTo(elbow)).toBeCloseTo(recipe.body.upperArmLength)
          }
        }
      } finally { rig.dispose() }
    }
  })
})
