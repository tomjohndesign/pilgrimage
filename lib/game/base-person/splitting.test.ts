import { describe, expect, it } from "vitest"
import * as THREE from "three"
import { PERSON_PRESETS, personRecipe } from "./design"
import { createBasePersonRig } from "./rig"
import { POPULATION_PROFILES, populationDesign } from "./population"
import { TRAVELER_TYPES } from "../travelers"
import { BASE_PERSON, legPose } from "./pose"
import { actionPlaybackRate } from "./activity"
import { SPLITTING_CONTACT, SPLITTING_FRAMES, SPLITTING_LANDED, SPLITTING_PICKUP, SPLITTING_PLACED, splittingMotion } from "./splitting"

const designs = [...POPULATION_PROFILES.map((_, i) => populationDesign(TRAVELER_TYPES.peasant, i)), ...Object.values(PERSON_PRESETS)]

describe("splitting and reloading wood", () => {
  it("holds the axe vertically down beside the right hip during reloading", () => {
    for (const design of designs) {
      const recipe = personRecipe(design), rig = createBasePersonRig(recipe)
      try {
        const axe = rig.root.getObjectByName("woodcutting-axe")!
        const blade = rig.root.getObjectByName("axe-head") as THREE.Mesh
        for (let frame = SPLITTING_LANDED; frame <= SPLITTING_PLACED; frame += 0.25) {
          rig.pose(frame / SPLITTING_FRAMES, "woodcutting")
          const axis = new THREE.Vector3(0, 1, 0).applyQuaternion(axe.getWorldQuaternion(new THREE.Quaternion()))
          expect(axis.y).toBeCloseTo(-1)
          const hand = rig.root.getObjectByName("right-hand")!.getWorldPosition(new THREE.Vector3())
          const head = blade.getWorldPosition(new THREE.Vector3())
          expect(head.y).toBeLessThan(hand.y - 0.2)
          const hip = legPose("right", frame / SPLITTING_FRAMES, "woodcutting", recipe.body).hip
          expect(hand.y - hip[1]).toBeCloseTo(0.18, 2)
          expect(head.x).toBeLessThan(-0.45)
          const points = blade.geometry.getAttribute("position")
          for (let i = 0; i < points.count; i++) {
            const point = new THREE.Vector3().fromBufferAttribute(points, i).applyMatrix4(blade.matrixWorld)
            expect(point.y).toBeGreaterThan(0.02)
          }
        }
      } finally { rig.dispose() }
    }
  })

  it("keeps the axe in the hands and clear of the head through the full circular swing", () => {
    for (const design of designs) {
      const recipe = personRecipe(design), rig = createBasePersonRig(recipe)
      try {
        const axe = rig.root.getObjectByName("woodcutting-axe")!, head = rig.root.getObjectByName("head-shape")!
        for (let frame = 0; frame < SPLITTING_FRAMES * 4; frame++) {
          const phase = frame / (SPLITTING_FRAMES * 4), motion = splittingMotion(phase)
          rig.pose(phase, "woodcutting")
          for (const [side, grip] of [["right", 0], ["left", 0.18]] as const) {
            if (side === "left" && motion.release > 0) continue
            const palm = rig.root.getObjectByName(`${side}-hand`)!.getWorldPosition(new THREE.Vector3())
            if (side === "right" && motion.parked > 0) {
              const onShaft = axe.worldToLocal(palm)
              expect(Math.hypot(onShaft.x, onShaft.z)).toBeLessThan(0.005)
              expect(onShaft.y).toBeGreaterThanOrEqual(-0.005)
              expect(onShaft.y).toBeLessThan(0.51)
            } else expect(palm.distanceTo(axe.localToWorld(new THREE.Vector3(0, grip, 0)))).toBeLessThan(0.005)
          }
          // Sample the full shaft against the head's volume, allowing the path behind and overhead.
          for (let y = -0.18; y <= 0.72; y += 0.03) {
            const point = head.worldToLocal(axe.localToWorld(new THREE.Vector3(0, y, 0)))
            const width = recipe.body.headWidth + 0.025, height = recipe.body.headHeight + 0.025
            expect((point.x / width) ** 2 + (point.y / height) ** 2 + (point.z / width) ** 2).toBeGreaterThan(1)
          }
        }
      } finally { rig.dispose() }
    }
  })

  it("coils behind the shoulder, passes above the crown, and drives forward into the wood", () => {
    const rig = createBasePersonRig()
    try {
      const blade = rig.root.getObjectByName("axe-head")!
      rig.pose(16 / SPLITTING_FRAMES, "woodcutting")
      const back = blade.getWorldPosition(new THREE.Vector3())
      const drawnKnee = legPose("left", 16 / SPLITTING_FRAMES, "woodcutting", personRecipe().body).knee
      expect(back.z).toBeLessThan(-0.4)
      rig.pose(22 / SPLITTING_FRAMES, "woodcutting")
      const crown = blade.getWorldPosition(new THREE.Vector3())
      expect(crown.y).toBeGreaterThan(rig.sockets.head.getWorldPosition(new THREE.Vector3()).y)
      rig.pose(SPLITTING_CONTACT / SPLITTING_FRAMES, "woodcutting")
      const hit = blade.getWorldPosition(new THREE.Vector3())
      expect(hit.z - back.z).toBeGreaterThan(1.2)
      expect(crown.y - hit.y).toBeGreaterThan(0.8)
      const hitKnee = legPose("left", SPLITTING_CONTACT / SPLITTING_FRAMES, "woodcutting", personRecipe().body).knee
      expect(Math.hypot(...hitKnee.map((v, i) => v - drawnKnee[i]))).toBeGreaterThan(0.04)
    } finally { rig.dispose() }
  })

  it("drops both lengthwise halves onto the ground and leaves the stump empty until reloading", () => {
    for (const design of designs) {
      const rig = createBasePersonRig(personRecipe(design))
      try {
        const halves = ["left", "right"].map(side => rig.root.getObjectByName(`log-${side}-half`) as THREE.Mesh)
        const lowest = (part: THREE.Mesh) => {
          const points = part.geometry.getAttribute("position")
          return Math.min(...Array.from({ length: points.count }, (_, i) => new THREE.Vector3().fromBufferAttribute(points, i).applyMatrix4(part.matrixWorld).y))
        }
        rig.pose(SPLITTING_CONTACT / SPLITTING_FRAMES, "woodcutting")
        for (const half of halves) expect(lowest(half)).toBeCloseTo(0.32, 5)
        rig.pose((SPLITTING_CONTACT + 5) / SPLITTING_FRAMES, "woodcutting")
        for (const half of halves) {
          expect(lowest(half)).toBeGreaterThan(0)
          expect(lowest(half)).toBeLessThan(0.32)
        }
        for (const frame of [SPLITTING_LANDED, SPLITTING_PICKUP, SPLITTING_PLACED, 63]) {
          rig.pose(frame / SPLITTING_FRAMES, "woodcutting")
          for (const half of halves) {
            expect(lowest(half)).toBeCloseTo(0, 5)
            expect(Math.abs(half.getWorldPosition(new THREE.Vector3()).x)).toBeGreaterThan(0.4)
            const cutFaceUp = new THREE.Vector3(0, 0, 1).applyQuaternion(half.getObjectByName("log-split-face")!.getWorldQuaternion(new THREE.Quaternion()))
            expect(cutFaceUp.y).toBeCloseTo(1)
          }
        }
      } finally { rig.dispose() }
    }
  })

  it("crouches to grab a fresh round, carries it in the left palm, and places it on the stump", () => {
    for (const design of designs) {
      const recipe = personRecipe(design), rig = createBasePersonRig(recipe)
      try {
        const round = rig.root.getObjectByName("replacement-log") as THREE.Mesh
        rig.pose(0, "woodcutting")
        const source = round.getWorldPosition(new THREE.Vector3())
        for (let frame = SPLITTING_PICKUP; frame <= SPLITTING_PLACED; frame += 0.25) {
          rig.pose(frame / SPLITTING_FRAMES, "woodcutting")
          const hand = rig.root.getObjectByName("left-hand")!.getWorldPosition(new THREE.Vector3())
          expect(hand.distanceTo(round.localToWorld(new THREE.Vector3(0, 0.12, -0.12))), `${design.bodyType}, legs ${design.legs}, frame ${frame}`).toBeLessThan(0.005)
        }
        expect(round.position.x).toBeCloseTo(0)
        expect(round.position.z).toBeCloseTo(0.82)
        expect(round.position.y - source.y).toBeCloseTo(0.32)
        for (let frame = 0; frame < SPLITTING_FRAMES; frame++) for (const side of ["left", "right"] as const) {
          const leg = legPose(side, frame / SPLITTING_FRAMES, "woodcutting", recipe.body)
          expect(leg.knee[1]).toBeGreaterThan(0.07)
          expect(leg.hip[1]).toBeGreaterThanOrEqual(0.22 - 1e-8)
          expect(leg.ankle).toEqual(legPose(side, 0, "woodcutting", recipe.body).ankle)
        }
        // One full load/split cycle fits in the simulation's five-second gathering interval.
        const duration = SPLITTING_FRAMES / (BASE_PERSON.defaultFps * actionPlaybackRate("woodcutting", design))
        expect(duration).toBeGreaterThan(3)
        expect(duration).toBeLessThanOrEqual(5)
        rig.pose(0, "idle")
        expect(round.visible).toBe(false)
      } finally { rig.dispose() }
    }
  })
})
