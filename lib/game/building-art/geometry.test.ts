import { describe, expect, it } from "vitest"
import { Box3, BoxGeometry, BufferGeometry, Float32BufferAttribute, Matrix4, Euler, Quaternion, Vector3 } from "three"
import { PERSON_HEIGHT, HOVEL_DOOR_HEIGHT, HOVEL_DOOR_WIDTH } from "../world-scale"
import { buildingDimensions } from "./dimensions"
import { buildingParts } from "./geometry"
import { LEGACY_RECIPE as DEFAULT_RECIPE, VARIANTS, buildingPrompt, recipeSchema } from "./style"

describe("building art contract", () => {
  it("keeps every variant within its reserved ground footprint across supported sizes", () => {
    for (const variant of VARIANTS) for (const [width, depth] of [[3,3], [5,5], [3,5], [5,3]]) {
      const recipe = { ...DEFAULT_RECIPE, variant: variant.id, width, depth }
      const total = new Box3()
      for (const part of buildingParts(recipe)) {
        const geometry = part.size ? new BoxGeometry(...part.size) : new BufferGeometry().setAttribute("position", new Float32BufferAttribute(part.vertices!,3))
        const matrix = new Matrix4().compose(new Vector3(...part.position), new Quaternion().setFromEuler(new Euler(...(part.rotation ?? [0,0,0]))), new Vector3(1,1,1))
        geometry.applyMatrix4(matrix); geometry.computeBoundingBox()
        const box = geometry.boundingBox as Box3
        total.union(box)
        expect(box.min.x, `${variant.id} ${width}×${depth}: ${part.name} west`).toBeGreaterThanOrEqual(-width/2 - 0.001)
        expect(box.max.x, `${variant.id} ${width}×${depth}: ${part.name} east`).toBeLessThanOrEqual(width/2 + 0.001)
        expect(box.min.z, `${variant.id} ${width}×${depth}: ${part.name} north`).toBeGreaterThanOrEqual(-depth/2 - 0.001)
        expect(box.max.z, `${variant.id} ${width}×${depth}: ${part.name} south`).toBeLessThanOrEqual(depth/2 + 0.001)
        geometry.dispose()
      }
      // Bounds must fill the declared footprint, not merely fit somewhere inside it.
      expect(total.max.x - total.min.x).toBeGreaterThan(width - 0.15)
      expect(total.max.z - total.min.z).toBeGreaterThan(depth - 0.15)
      const floor = buildingParts(recipe).find(p => p.name === "floor")!
      expect(floor.size![0]).toBeGreaterThan(width - 0.4)
      expect(floor.size![2]).toBeGreaterThan(depth - 0.4)
    }
  })
  it("leaves a real doorway in every facade", () => {
    for (const variant of VARIANTS) {
      const parts = buildingParts({ ...DEFAULT_RECIPE, variant: variant.id })
      const left = parts.find((p) => p.name === "front-left")!
      const right = parts.find((p) => p.name === "front-right")!
      expect(left.position[0] + left.size![0]/2).toBeCloseTo(-HOVEL_DOOR_WIDTH / 2)
      expect(right.position[0] - right.size![0]/2).toBeCloseTo(HOVEL_DOOR_WIDTH / 2)
      expect(parts.some((p) => p.name === "ridge-cap")).toBe(true)
    }
  })
  it("sizes the entrance for a real game character and keeps the hovel below four people tall", () => {
    for (const variant of VARIANTS) {
      const recipe = { ...DEFAULT_RECIPE, variant: variant.id }
      const door = buildingParts(recipe).find(p => p.name === "doorway-shadow")!
      expect(door.size![1]).toBeCloseTo(HOVEL_DOOR_HEIGHT)
      expect(door.size![1] / PERSON_HEIGHT).toBeGreaterThan(1.15)
      expect(door.size![1] / PERSON_HEIGHT).toBeLessThan(1.35)
      expect(buildingDimensions(recipe).ridgeHeight / PERSON_HEIGHT).toBeLessThan(4)
      expect(buildingDimensions(recipe).width).toBe(5)
    }
  })
  it("exports camera changes without moving the entrance and rejects unsafe recipe sizes", () => {
    const prompt = buildingPrompt({ ...DEFAULT_RECIPE, output: "sprite", view: 2 })
    expect(prompt).toContain("northwest")
    expect(prompt).toContain("entrance always remains on the south side")
    expect(prompt).toContain("transparent alpha")
    expect(recipeSchema.safeParse({ ...DEFAULT_RECIPE, width: 0 }).success).toBe(false)
    expect(recipeSchema.safeParse({ ...DEFAULT_RECIPE, notes: "x".repeat(2001) }).success).toBe(false)
  })
})
