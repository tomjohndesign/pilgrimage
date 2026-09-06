import { describe, expect, it } from "vitest"
import * as THREE from "three"
import { DEFAULT_DESIGN, PERSON_PRESETS, personRecipe, validatePersonDesign } from "./design"
import { inkPersonFrame } from "./ink"
import { legPose, walkFoot } from "./pose"
import { populationDesign, POPULATION_PROFILES } from "./population"
import { createBasePersonRig } from "./rig"
import { TRAVELER_TYPES } from "../travelers"

describe("walking body and clothing", () => {
  it("pivots hips over fixed foot targets, counter-turns the chest and flexes the elbows", () => {
    const recipe = personRecipe(), rig = createBasePersonRig(recipe)
    const hips = rig.root.getObjectByName("pelvis")!, chest = rig.root.getObjectByName("chest-pivot")!
    const elbow = rig.root.getObjectByName("left-elbow")!
    try {
      rig.pose(0, "walk")
      const firstElbow = elbow.rotation.x, firstHip = hips.rotation.y
      expect(firstHip * (chest.rotation.y + firstHip)).toBeLessThan(0)
      const relativeHeadY = () => rig.sockets.head.getWorldPosition(new THREE.Vector3()).y - hips.position.y
      const firstHead = relativeHeadY()
      rig.pose(0.25, "walk")
      expect(relativeHeadY() - firstHead).toBeCloseTo(0.024)
      rig.pose(0.5, "walk")
      expect(hips.rotation.y).toBeCloseTo(-firstHip)
      expect(Math.abs(elbow.rotation.x - firstElbow)).toBeGreaterThan(0.1)
      for (let frame = 0; frame < 20; frame++) for (const side of ["left", "right"] as const) {
        rig.pose(frame / 20, "walk")
        const leg = legPose(side, frame / 20, "walk", recipe.body)
        expect(leg.ankle).toEqual(walkFoot(side, frame / 20, recipe.body).ankle)
        const hip = new THREE.Vector3((side === "left" ? 1 : -1) * recipe.body.legOffset, 0, 0)
        hips.localToWorld(hip)
        leg.hip.forEach((value, i) => expect(value).toBeCloseTo(hip.toArray()[i], 10))
      }
      rig.pose(0, "idle")
      expect(hips.rotation.y).toBe(0)
      expect(chest.rotation.y).toBeCloseTo(0)
      expect(relativeHeadY()).toBeCloseTo(firstHead)
    } finally { rig.dispose() }
  })

  it("lowers and narrows the far sleeve, swapping sides cleanly without shortening arm bones", () => {
    const rig = createBasePersonRig(), b = personRecipe().body
    try {
      for (const [row, far, near] of [[2, "right", "left"], [6, "left", "right"]] as const) {
        rig.view(row); rig.pose(0, "walk")
        const part = (side: string, name: string) => rig.root.getObjectByName(`${side}-${name}`)!
        expect(part(far, "shoulder").position.y).toBeLessThan(part(near, "shoulder").position.y)
        expect(part(far, "upper-sleeve").scale.x).toBeLessThan(part(near, "upper-sleeve").scale.x)
        for (const side of [far, near]) {
          const start = part(side, "shoulder").getWorldPosition(new THREE.Vector3())
          const elbow = part(side, "elbow").getWorldPosition(new THREE.Vector3())
          expect(start.distanceTo(elbow)).toBeCloseTo(b.upperArmLength, 10)
        }
      }
      rig.view(0); rig.pose(0, "idle")
      expect(rig.root.getObjectByName("left-shoulder")!.position.y).toBe(rig.root.getObjectByName("right-shoulder")!.position.y)
    } finally { rig.dispose() }
  })

  it("puts sandals on every peasant profile and boots on all other callings and monks", () => {
    const { footwear: _, ...legacy } = DEFAULT_DESIGN
    expect(validatePersonDesign(legacy).footwear).toBe("Boots")
    expect(() => validatePersonDesign({ ...DEFAULT_DESIGN, footwear: "Bare" })).toThrow()
    for (const type of Object.values(TRAVELER_TYPES)) for (let variant = 0; variant < POPULATION_PROFILES.length; variant++) {
      expect(populationDesign(type, variant).footwear).toBe(type.id === "peasant" ? "Sandals" : "Boots")
    }
    for (const design of [populationDesign(TRAVELER_TYPES.peasant, 0), populationDesign(TRAVELER_TYPES.peasant, 3), DEFAULT_DESIGN, PERSON_PRESETS.Female, PERSON_PRESETS.Monk]) {
      const rig = createBasePersonRig(personRecipe(design))
      try {
        for (const side of ["left", "right"]) {
          const foot = rig.root.getObjectByName(`${side}-foot`)!
          expect(foot.getObjectByName(`${side}-sole`)).toBeDefined()
          expect(!!foot.getObjectByName(`${side}-boot-cuff`)).toBe(design.footwear === "Boots")
          expect(!!foot.getObjectByName(`${side}-sandal-strap`)).toBe(design.footwear === "Sandals")
          for (let frame = 0; frame < 20; frame++) {
            rig.pose(frame / 20, "walk")
            expect(foot.getWorldQuaternion(new THREE.Quaternion()).angleTo(new THREE.Quaternion())).toBeCloseTo(0)
            expect(new THREE.Box3().setFromObject(foot).min.y).toBeGreaterThan(-0.013)
          }
        }
      } finally { rig.dispose() }
    }
  })

  it("softens cloth intersections while preserving the outer silhouette and hand boundary", () => {
    const size = 8, pixels = new Uint8ClampedArray(size * size * 4), parts = pixels.slice()
    for (let y = 2; y < 6; y++) for (let x = 2; x < 6; x++) {
      const i = (y * size + x) * 4
      pixels.set([150, 150, 150, 255], i)
      parts.set([x < 4 ? 3 : 8, 0, 0, 255], i)
    }
    const palette = [[30, 30, 30], [120, 120, 120], [150, 150, 150]]
    const cloth = inkPersonFrame(pixels, parts, size, palette, 1).pixels
    expect(cloth[(3 * size + 4) * 4]).toBe(120)
    expect(cloth[(3 * size + 1) * 4]).toBe(30)
    parts[(3 * size + 4) * 4] = 10
    const hand = inkPersonFrame(pixels, parts, size, palette, 1).pixels
    expect(hand[(3 * size + 4) * 4]).toBe(30)
  })
})
