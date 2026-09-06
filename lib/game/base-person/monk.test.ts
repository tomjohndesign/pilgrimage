import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import * as THREE from "three"
import { DEFAULT_DESIGN, PERSON_PRESETS, personRecipe, validatePersonDesign } from "./design"
import { MONK_VISUAL } from "./monk-assets"
import { createBasePersonRig } from "./rig"

describe("parametric monks", () => {
  it("keeps legacy clothing defaults and validates the new outfit choices", () => {
    const { garment: _garment, beltStyle: _belt, ...legacy } = DEFAULT_DESIGN
    expect(validatePersonDesign(legacy)).toEqual(DEFAULT_DESIGN)
    for (const input of [{ garment: "Unknown" }, { beltStyle: "Unknown" }]) {
      expect(() => validatePersonDesign({ ...DEFAULT_DESIGN, ...input })).toThrow()
    }
  })

  it("builds a male ankle-length habit, exposed crown and long rope ends", () => {
    const design = PERSON_PRESETS.Monk
    const recipe = personRecipe(design), rig = createBasePersonRig(recipe)
    const b = recipe.body
    try {
      expect(design.bodyType).toBe("Male")
      expect(b.bustDepth).toBe(0)
      expect(b.tunicHem).toBeGreaterThan(b.ankleHeight)
      expect(b.tunicHem).toBeLessThan(b.ankleHeight + 0.05)
      expect(recipe.renderPalette).toContain(recipe.palette.belt)
      const robe = rig.root.getObjectByName("robe") as THREE.Mesh
      expect((robe.material as THREE.MeshLambertMaterial).color.getHexString()).toBe(design.tunicColor.slice(1))
      expect(rig.root.getObjectByName("head-covering")).toBeUndefined()
      rig.pose(0, "idle")
      const ring = rig.root.getObjectByName("tonsure") as THREE.Mesh
      const ray = new THREE.Raycaster(new THREE.Vector3(0, 3, 0), new THREE.Vector3(0, -1, 0))
      expect(ray.intersectObject(ring)).toHaveLength(0)
      expect(ray.intersectObject(rig.root)[0].point.y).toBeCloseTo(b.headCenter + b.headHeight * 1.02)
      expect(rig.root.getObjectByName("rope-belt")).toBeDefined()
      for (const index of [0, 1]) {
        const tail = rig.root.getObjectByName(`rope-tail-${index}`) as THREE.Mesh
        tail.geometry.computeBoundingBox()
        expect(tail.geometry.boundingBox!.max.y - tail.geometry.boundingBox!.min.y).toBeGreaterThan(0.5)
        expect(tail.geometry.boundingBox!.min.y).toBeGreaterThan(b.tunicHem)
      }
      rig.pose(0.25)
      const walking = Array.from(robe.geometry.getAttribute("position").array)
      rig.pose(0, "idle")
      expect(Array.from(robe.geometry.getAttribute("position").array)).not.toEqual(walking)
      const idle = Array.from(robe.geometry.getAttribute("position").array)
      rig.pose(0.75, "idle")
      expect(Array.from(robe.geometry.getAttribute("position").array)).toEqual(idle)
    } finally { rig.dispose() }
  })

  it("ships the current Monk preset in matching eight-direction sprite and shadow sheets", () => {
    expect(MONK_VISUAL.design).toEqual(PERSON_PRESETS.Monk)
    for (const [url, columns] of [[MONK_VISUAL.walk.url, 8], [MONK_VISUAL.idle.url, 1],
      [MONK_VISUAL.shadow.walk, 8], [MONK_VISUAL.shadow.idle, 1]] as const) {
      const png = readFileSync(`${process.cwd()}/public${url}`)
      expect(png.subarray(1, 4).toString()).toBe("PNG")
      expect(png.readUInt32BE(16)).toBe(columns * 64)
      expect(png.readUInt32BE(20)).toBe(8 * 64)
    }
  })
})
