import { describe, expect, it } from "vitest"
import * as THREE from "three"
import { DEFAULT_DESIGN, PERSON_PRESETS, personRecipe } from "./design"
import { woodcuttingMotion, woodcuttingProfile } from "./woodcutting"
import { SPLITTING_CONTACT, SPLITTING_FRAMES, SPLITTING_LANDED } from "./splitting"
import { gatheringMotion } from "./gathering"
import { actionPlaybackRate } from "./activity"
import { PERSON_CLIPS, legPose } from "./pose"
import { createBasePersonRig } from "./rig"
import { POPULATION_PROFILES, populationDesign } from "./population"
import { TRAVELER_TYPES } from "../travelers"

describe("character activity motions", () => {
  it("plants the vertical blade in the grain split, forward of the feet, for every body profile", () => {
    const designs = [...POPULATION_PROFILES.map((_, i) => populationDesign(TRAVELER_TYPES.peasant, i)), PERSON_PRESETS.Monk]
    for (const design of designs) {
      const rig = createBasePersonRig(personRecipe(design)), profile = woodcuttingProfile(design)
      try {
        const blade = rig.root.getObjectByName("axe-head") as THREE.Mesh
        const log = rig.root.getObjectByName("woodcutting-log")!
        const shaft = rig.root.getObjectByName("axe-handle") as THREE.Mesh
        shaft.geometry.computeBoundingBox()
        expect(shaft.geometry.boundingBox!.max.y - shaft.geometry.boundingBox!.min.y).toBeGreaterThan(0.85)
        rig.pose(SPLITTING_CONTACT / SPLITTING_FRAMES, "woodcutting")
        const edge = blade.localToWorld(new THREE.Vector3(0, 0, 0.2))
        const vertical = new THREE.Vector3(0, 0, 1).applyQuaternion(blade.getWorldQuaternion(new THREE.Quaternion()))
        expect(vertical.y).toBeCloseTo(-1)
        expect(edge.x).toBeCloseTo(0, 2)
        expect(edge.z).toBeCloseTo(log.position.z, 2)
        expect(edge.y).toBeCloseTo(log.position.y + 0.38 * profile.logScale - 0.04 * profile.axeScale, 2)
        for (const side of ["left", "right"]) {
          const foot = rig.root.getObjectByName(`${side}-foot`)!
          expect(edge.z - foot.getWorldPosition(new THREE.Vector3()).z).toBeGreaterThan(0.5)
          const half = rig.root.getObjectByName(`log-${side}-half`) as THREE.Mesh
          half.geometry.computeBoundingBox()
          const size = half.geometry.boundingBox!.getSize(new THREE.Vector3())
          expect(size.y).toBeCloseTo(0.38)
          expect(size.x).toBeCloseTo(0.14)
          expect(half.getObjectByName("log-split-face")).toBeDefined()
          expect(half.children.filter(child => child.name === "log-grain")).toHaveLength(3)
          rig.pose(SPLITTING_LANDED / SPLITTING_FRAMES, "woodcutting")
          expect(Math.abs(half.position.x)).toBeGreaterThan(0.1)
        }
      } finally { rig.dispose() }
    }
  })

  it("uses a planted side swing for standing trees and an overhead chop for fallen wood", () => {
    for (const design of [DEFAULT_DESIGN, PERSON_PRESETS.Female, PERSON_PRESETS.Monk]) {
      const recipe = personRecipe(design), rig = createBasePersonRig(recipe)
      try {
        const profile = woodcuttingProfile(design)
        const blade = rig.root.getObjectByName("axe-head")!
        const axe = rig.root.getObjectByName("woodcutting-axe")!
        for (const clip of ["treeFelling", "woodcutting"] as const) {
          const left = legPose("left", 0, clip, recipe.body), right = legPose("right", 0, clip, recipe.body)
          expect(left.ankle[0] - right.ankle[0]).toBeGreaterThan(recipe.body.legOffset * 3)
          for (let frame = 0; frame < 24; frame++) {
            expect(legPose("left", frame / 24, clip, recipe.body).ankle).toEqual(left.ankle)
            rig.pose(frame / 24, clip)
            const handle = new THREE.Vector3(0, 1, 0).applyQuaternion(axe.getWorldQuaternion(new THREE.Quaternion()))
            if (clip === "treeFelling") expect(Math.abs(handle.y)).toBeLessThan(1e-6)
          }
          rig.pose(clip === "woodcutting" ? 22 / SPLITTING_FRAMES : profile.liftEnd, clip)
          const drawnBack = blade.getWorldPosition(new THREE.Vector3())
          const windupHead = rig.sockets.head.getWorldQuaternion(new THREE.Quaternion())
          rig.pose(clip === "woodcutting" ? SPLITTING_CONTACT / SPLITTING_FRAMES : profile.strikeEnd, clip)
          const contact = blade.getWorldPosition(new THREE.Vector3())
          expect(contact.distanceTo(drawnBack)).toBeGreaterThan(0.7)
          if (clip === "treeFelling") {
            expect(contact.z).toBeGreaterThan(drawnBack.z + 0.5)
            expect(windupHead.angleTo(rig.sockets.head.getWorldQuaternion(new THREE.Quaternion()))).toBeGreaterThan(0.4)
          } else {
            expect(drawnBack.y).toBeGreaterThan(recipe.body.headCenter)
            expect(drawnBack.y - contact.y).toBeGreaterThan(0.8)
            rig.pose(16 / SPLITTING_FRAMES, clip)
            expect(blade.getWorldPosition(new THREE.Vector3()).z).toBeLessThan(-0.25)
          }
          expect(rig.root.getObjectByName("woodcutting-log")!.visible).toBe(clip === "woodcutting")
          expect(rig.root.getObjectByName("gathering-basket")!.visible).toBe(false)
        }
      } finally { rig.dispose() }
    }
  })

  it("keeps the side swing within both arms' reach without releasing the axe", () => {
    const designs = [...POPULATION_PROFILES.map((_, i) => populationDesign(TRAVELER_TYPES.peasant, i)), ...Object.values(PERSON_PRESETS)]
    for (const design of designs) {
      const rig = createBasePersonRig(personRecipe(design))
      try {
        const axe = rig.root.getObjectByName("woodcutting-axe")!
        for (let frame = 0; frame < 96; frame++) {
          rig.pose(frame / 96, "treeFelling")
          for (const [side, grip] of [["rightHand", 0], ["leftHand", 0.18]] as const) {
            const palm = rig.root.getObjectByName(side.replace("Hand", "-hand"))!.getWorldPosition(new THREE.Vector3())
            const shaft = axe.localToWorld(new THREE.Vector3(0, grip, 0))
            expect(palm.distanceTo(shaft)).toBeLessThan(0.005)
          }
        }
      } finally { rig.dispose() }
    }
  })

  it("reserves most of the cycle for winding up and accelerates sharply into the final frame", () => {
    const male = woodcuttingProfile(DEFAULT_DESIGN), female = woodcuttingProfile(PERSON_PRESETS.Female)
    const monk = woodcuttingProfile(PERSON_PRESETS.Monk)
    for (const profile of [male, female, monk]) {
      expect(profile.liftEnd).toBeGreaterThan(0.65)
      expect(woodcuttingMotion(profile.liftEnd, profile).lift).toBeCloseTo(1)
      const middle = (profile.liftEnd + profile.strikeEnd) / 2
      expect(woodcuttingMotion(middle, profile).lift).toBeGreaterThan(0.8)
      expect(woodcuttingMotion(23 / 24, profile)).toMatchObject({ impact: true, striking: false })
      expect(woodcuttingMotion(23 / 24, profile).lift).toBeCloseTo(0)
      expect(woodcuttingMotion(1, profile)).toEqual(woodcuttingMotion(0, profile))
    }
    expect(actionPlaybackRate("treeFelling", DEFAULT_DESIGN)).toBeGreaterThan(actionPlaybackRate("treeFelling", PERSON_PRESETS.Monk))
    expect(female.axeScale).toBeLessThan(male.axeScale)
  })

  it("shows radiating impact lines at contact and clears them during recovery", () => {
    for (const design of [DEFAULT_DESIGN, PERSON_PRESETS.Female, PERSON_PRESETS.Monk]) {
      const rig = createBasePersonRig(personRecipe(design))
      try {
        for (const clip of ["treeFelling", "woodcutting"] as const) {
          const lines = rig.root.getObjectByName("axe-impact-lines")!
          const count = PERSON_CLIPS[clip].frames
          const visible = Array.from({ length: count }, (_, frame) => {
            rig.pose(frame / count, clip)
            return lines.visible
          })
          const contact = clip === "woodcutting" ? SPLITTING_CONTACT : 23
          expect(visible.slice(0, contact)).not.toContain(true)
          expect(visible[contact]).toBe(true)
          if (clip === "woodcutting") expect(visible.slice(contact + 2)).not.toContain(true)
          expect(lines.children.length).toBeGreaterThanOrEqual(5)
          expect(lines.parent!.name).toBe("woodcutting-axe")
          rig.pose(0, clip)
          expect(lines.visible).toBe(false)
        }
        rig.pose(0, "idle")
        expect(rig.root.getObjectByName("woodcutting-axe")!.visible).toBe(false)
      } finally { rig.dispose() }
    }
  })

  it("keeps long hems around planted legs through every chopping frame", () => {
    for (const design of [PERSON_PRESETS.Female, PERSON_PRESETS.Monk]) {
      const recipe = personRecipe(design), rig = createBasePersonRig(recipe)
      try {
        const dress = rig.root.getObjectByName(design.garment === "Robe" ? "robe" : "sleeveless-dress") as THREE.Mesh
        const positions = dress.geometry.getAttribute("position")
        rig.pose(0, "idle")
        const hem = Array.from({ length: positions.count }, (_, i) => i).filter(i => Math.abs(new THREE.Vector3().fromBufferAttribute(positions, i).applyMatrix4(dress.matrixWorld).y - recipe.body.tunicHem) < 0.001)
        expect(hem.length).toBeGreaterThan(0)
        rig.pose(0, "treeFelling")
        const rest = hem.map(i => new THREE.Vector3().fromBufferAttribute(positions, i).applyMatrix4(dress.matrixWorld))
        for (const clip of ["treeFelling", "woodcutting"] as const) for (let frame = 0; frame < PERSON_CLIPS[clip].frames; frame++) {
          rig.pose(frame / PERSON_CLIPS[clip].frames, clip)
          hem.forEach((i, j) => {
            const point = new THREE.Vector3().fromBufferAttribute(positions, i).applyMatrix4(dress.matrixWorld)
            expect(point.distanceTo(rest[j])).toBeLessThan(0.000001)
          })
          for (const debug of [false, true]) {
            rig.trackSides(debug); rig.inkMask(true)
            rig.root.traverse(part => {
              if (part instanceof THREE.Mesh && part.userData.clipAboveHem) {
                const plane = (part.material as THREE.Material).clippingPlanes![0]
                expect(plane.distanceToPoint(new THREE.Vector3(0, recipe.body.tunicHem + 0.05, 0))).toBeLessThan(0)
              }
            })
            rig.inkMask(false)
          }
        }
      } finally { rig.dispose() }
    }
  })

  it("clips covered knees out of sitting, prayer and gathering poses", () => {
    for (const design of [PERSON_PRESETS.Female, PERSON_PRESETS.Monk]) {
      const rig = createBasePersonRig(personRecipe(design))
      try {
        for (const clip of ["sitting", "praying", "gathering"] as const) {
          for (let frame = 0; frame < PERSON_CLIPS[clip].frames; frame++) {
            rig.pose(frame / PERSON_CLIPS[clip].frames, clip)
            for (const debug of [false, true]) {
              rig.trackSides(debug); rig.inkMask(true)
              rig.root.traverse(part => {
                if (part instanceof THREE.Mesh && part.userData.clipAboveHem) {
                  const plane = (part.material as THREE.Material).clippingPlanes![0]
                  expect(plane.distanceToPoint(new THREE.Vector3(0, 0.15, 0))).toBeLessThan(0)
                  expect(plane.distanceToPoint(new THREE.Vector3(0, 0.03, 0))).toBeGreaterThan(0)
                }
              })
              rig.inkMask(false)
            }
          }
        }
      } finally { rig.dispose() }
    }
  })

  it("reaches out, returns the harvest to a basket and gives monks a longer cycle", () => {
    expect(gatheringMotion(0).reach).toBe(0)
    expect(gatheringMotion(0.5)).toMatchObject({ reach: 1, holding: true })
    expect(gatheringMotion(0.9)).toMatchObject({ reach: 0, holding: false, deposited: true })
    expect(actionPlaybackRate("gathering", PERSON_PRESETS.Monk)).toBeLessThan(actionPlaybackRate("gathering", DEFAULT_DESIGN))
    for (const design of [DEFAULT_DESIGN, PERSON_PRESETS.Female, PERSON_PRESETS.Monk]) {
      const rig = createBasePersonRig(personRecipe(design))
      try {
        rig.pose(0.5, "gathering")
        const reach = rig.sockets.rightHand.getWorldPosition(new THREE.Vector3())
        expect(rig.root.getObjectByName("gathered-item")!.visible).toBe(true)
        rig.pose(0.9, "gathering")
        const returned = rig.sockets.rightHand.getWorldPosition(new THREE.Vector3())
        expect(returned.x).toBeLessThan(reach.x)
        expect(returned.z).toBeLessThan(reach.z)
        expect(rig.root.getObjectByName("gathered-item")!.visible).toBe(false)
        expect(rig.root.getObjectByName("gathering-basket")!.scale.x).toBe(design.bodyType === "Female" ? 0.7 : 1)
      } finally { rig.dispose() }
    }
  })

  it("adds sleeping props, turns women onto their side and crosses the monk's hands", () => {
    for (const design of [DEFAULT_DESIGN, PERSON_PRESETS.Female, PERSON_PRESETS.Monk]) {
      const rig = createBasePersonRig(personRecipe(design))
      try {
        rig.pose(0, "sleeping")
        expect(rig.root.getObjectByName("sleep-pillow")!.visible).toBe(true)
        expect(rig.root.getObjectByName("sleep-zzz")!.visible).toBe(true)
        const left = rig.sockets.leftHand.getWorldPosition(new THREE.Vector3()), right = rig.sockets.rightHand.getWorldPosition(new THREE.Vector3())
        if (design.walkStyle === "Devotional") expect(left.distanceTo(right)).toBeLessThan(0.12)
        if (design.bodyType === "Female") {
          const headForward = new THREE.Vector3(0, 0, 1).applyQuaternion(rig.root.getObjectByName("head-pivot")!.getWorldQuaternion(new THREE.Quaternion()))
          expect(Math.abs(headForward.x)).toBeGreaterThan(0.9)
        }
        rig.pose(0, "idle")
        expect(rig.root.getObjectByName("sleep-pillow")!.visible).toBe(false)
        expect(rig.root.getObjectByName("sleep-zzz")!.visible).toBe(false)
      } finally { rig.dispose() }
    }
  })
})
