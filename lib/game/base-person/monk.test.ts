import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import * as THREE from "three"
import { DEFAULT_DESIGN, PERSON_PRESETS, personRecipe, validatePersonDesign } from "./design"
import { MONK_VISUAL } from "./monk-assets"
import { ACTION_CLIPS, PERSON_CLIPS } from "./pose"
import { createBasePersonRig } from "./rig"

describe("parametric monks", () => {
  it("keeps legacy clothing defaults and validates the new outfit choices", () => {
    const { garment: _garment, beltStyle: _belt, walkStyle: _walkStyle, ...legacy } = DEFAULT_DESIGN
    expect(validatePersonDesign(legacy)).toEqual(DEFAULT_DESIGN)
    for (const input of [{ garment: "Unknown" }, { beltStyle: "Unknown" }, { walkStyle: "Unknown" }]) {
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

  it("walks with a bowed head, folded hands and small bare feet", () => {
    const recipe = personRecipe(PERSON_PRESETS.Monk), rig = createBasePersonRig(recipe)
    const natural = createBasePersonRig(personRecipe({ ...PERSON_PRESETS.Monk, walkStyle: "Natural" }))
    try {
      const defaultBody = personRecipe().body
      expect(recipe.body.footLength).toBeLessThan(defaultBody.footLength * 0.8)
      expect(recipe.body.footWidth).toBeLessThan(defaultBody.footWidth * 0.8)
      const foot = rig.root.getObjectByName("left-foot") as THREE.Mesh
      expect((foot.material as THREE.MeshLambertMaterial).color.getHexString()).toBe(recipe.palette.skin.slice(1))
      let firstHands: number[][] | undefined
      for (let i = 0; i <= 8; i++) {
        rig.pose(i / 8, "walk"); natural.pose(i / 8, "walk")
        const left = rig.sockets.leftHand.getWorldPosition(new THREE.Vector3())
        const right = rig.sockets.rightHand.getWorldPosition(new THREE.Vector3())
        expect(left.distanceTo(right)).toBeLessThan(0.1)
        const hands = [left.toArray(), right.toArray()]
        if (firstHands) expect(hands).toEqual(firstHands)
        else firstHands = hands
        expect(rig.sockets.head.getWorldPosition(new THREE.Vector3()).y)
          .toBeLessThan(natural.sockets.head.getWorldPosition(new THREE.Vector3()).y)
      }
      rig.pose(0, "idle")
      expect(rig.root.getObjectByName("head-pivot")!.rotation.x).toBe(0)
    } finally { rig.dispose(); natural.dispose() }
  })

  it("loops the new poses, keeps rope ends above ground, and restores the standing robe", () => {
    const rig = createBasePersonRig(personRecipe(PERSON_PRESETS.Monk))
    const parts = ["robe", "rope-tail-0", "rope-tail-1"].map(name => rig.root.getObjectByName(name) as THREE.Mesh)
    const vertices = () => parts.map(part => Array.from(part.geometry.getAttribute("position").array))
    try {
      rig.pose(0, "idle")
      const rest = vertices()
      for (const clip of ACTION_CLIPS) {
        rig.pose(0, clip)
        const first = vertices()
        rig.pose(1, clip)
        vertices().forEach((points, i) => points.forEach((v, j) => expect(v).toBeCloseTo(first[i][j], 8)))
        if (clip === "sitting" || clip === "praying") {
          for (const part of parts.slice(1)) {
            const positions = part.geometry.getAttribute("position")
            for (let i = 0; i < positions.count; i++) {
              const point = new THREE.Vector3().fromBufferAttribute(positions, i).applyMatrix4(part.matrixWorld)
              expect(point.y).toBeGreaterThan(-0.03)
            }
          }
        }
        rig.pose(0, "idle")
        expect(vertices()).toEqual(rest)
      }
    } finally { rig.dispose() }
  })

  it("ships the current Monk preset in matching eight-direction sprite and shadow sheets", () => {
    expect(MONK_VISUAL.design).toEqual(PERSON_PRESETS.Monk)
    expect(Object.keys(MONK_VISUAL.actions)).toEqual([...ACTION_CLIPS])
    for (const clip of ACTION_CLIPS) {
      const action = MONK_VISUAL.actions[clip]!
      expect(action.columns).toBe(PERSON_CLIPS[clip].frames)
      for (const url of [action.url, action.shadow]) {
        const png = readFileSync(`${process.cwd()}/public${url}`)
        expect(png.readUInt32BE(16)).toBe(action.columns * 64)
        expect(png.readUInt32BE(20)).toBe(8 * 64)
      }
    }
    for (const [url, columns] of [[MONK_VISUAL.walk.url, 8], [MONK_VISUAL.idle.url, 1],
      [MONK_VISUAL.shadow.walk, 8], [MONK_VISUAL.shadow.idle, 1]] as const) {
      const png = readFileSync(`${process.cwd()}/public${url}`)
      expect(png.subarray(1, 4).toString()).toBe("PNG")
      expect(png.readUInt32BE(16)).toBe(columns * 64)
      expect(png.readUInt32BE(20)).toBe(8 * 64)
    }
  })
})
