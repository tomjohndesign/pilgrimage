import { describe, expect, it } from "vitest"
import * as THREE from "three"
import { DEFAULT_DESIGN, PERSON_PRESETS, personRecipe } from "./design"
import { woodcuttingMotion, woodcuttingProfile } from "./woodcutting"
import { gatheringMotion } from "./gathering"
import { actionPlaybackRate } from "./activity"
import { PERSON_CLIPS } from "./pose"
import { createBasePersonRig } from "./rig"

describe("character activity motions", () => {
  it("uses a slow lift, accelerating strike and held impact with distinct timing", () => {
    const male = woodcuttingProfile(DEFAULT_DESIGN), female = woodcuttingProfile(PERSON_PRESETS.Female)
    const monk = woodcuttingProfile(PERSON_PRESETS.Monk)
    expect(monk.reach).toBeLessThan(male.reach)
    expect(monk.lean).toBeLessThan(male.lean)
    expect(female.axeScale).toBeLessThan(male.axeScale)
    expect(female.logScale).toBeLessThan(male.logScale)
    for (const profile of [male, female, monk]) {
      expect(profile.liftEnd).toBeGreaterThan(profile.strikeEnd - profile.liftEnd)
      expect(woodcuttingMotion(profile.liftEnd, profile).lift).toBeCloseTo(1)
      const impact = woodcuttingMotion(0.9, profile)
      expect(impact).toMatchObject({ lift: 0, striking: false, split: 1 })
      expect(woodcuttingMotion(1, profile)).toEqual(woodcuttingMotion(0, profile))
    }
    const duration = (design: typeof DEFAULT_DESIGN) => PERSON_CLIPS.woodcutting.frames / (8 * actionPlaybackRate("woodcutting", design))
    expect(duration(PERSON_PRESETS.Female)).toBeGreaterThan(duration(DEFAULT_DESIGN))
    expect(duration(PERSON_PRESETS.Female) * (1 - female.strikeEnd))
      .toBeGreaterThan(duration(DEFAULT_DESIGN) * (1 - male.strikeEnd))
  })

  it("aligns the silver blade with the swing and splits wood only after impact", () => {
    for (const design of [DEFAULT_DESIGN, PERSON_PRESETS.Female, PERSON_PRESETS.Monk]) {
      const rig = createBasePersonRig(personRecipe(design))
      try {
        const blade = rig.root.getObjectByName("axe-head") as THREE.Mesh
        blade.geometry.computeBoundingBox()
        const size = blade.geometry.boundingBox!.getSize(new THREE.Vector3())
        expect(size.z).toBeGreaterThan(size.x * 3)
        expect((blade.material as THREE.MeshLambertMaterial).color.getHexString()).toBe("bac8cf")
        const left = rig.root.getObjectByName("log-left-half")!, right = rig.root.getObjectByName("log-right-half")!
        rig.pose(0, "woodcutting")
        const joined = right.position.x - left.position.x
        const profile = woodcuttingProfile(design)
        rig.pose(profile.liftEnd, "woodcutting")
        expect(rig.root.getObjectByName("axe-glint")!.visible).toBe(true)
        rig.pose((profile.liftEnd + profile.strikeEnd) / 2, "woodcutting")
        expect(rig.root.getObjectByName("axe-motion-streaks")!.visible).toBe(true)
        expect(right.position.x - left.position.x).toBe(joined)
        rig.pose(0.9, "woodcutting")
        expect(right.position.x - left.position.x).toBeGreaterThan(joined)
        expect(rig.root.getObjectByName("axe-motion-streaks")!.visible).toBe(false)
        rig.pose(0, "idle")
        expect(rig.root.getObjectByName("woodcutting-log")!.visible).toBe(false)
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
        const hem = Array.from({ length: positions.count }, (_, i) => i).filter(i => Math.abs(positions.getY(i) - recipe.body.tunicHem) < 0.001)
        const rest = hem.map(i => new THREE.Vector3().fromBufferAttribute(positions, i).applyMatrix4(dress.matrixWorld))
        for (let frame = 0; frame < PERSON_CLIPS.woodcutting.frames; frame++) {
          rig.pose(frame / PERSON_CLIPS.woodcutting.frames, "woodcutting")
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
