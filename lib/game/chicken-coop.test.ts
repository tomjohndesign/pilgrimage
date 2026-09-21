import { describe, expect, it } from "vitest"
import { COOP_FLOCK, coopPoint, syncCoopChickens, stepCoopChicken } from "./chicken-coop"
import { buildingPreviewMap } from "./building-art/map-preview"
import { earlyBuildingRecipe } from "./building-art/style"
import { structureParts } from "./building-art/structure"
import { BUILD_CATALOG } from "./balance"
import { rotateBuildingPoint } from "./building-rotation"
import { createWildlife, stepWildlife, type WildlifeAnimal } from "./wildlife/simulation"
import { BASE_CHARACTER_SCALE } from "./base-person/gait"

describe("chicken coops", () => {
  it("builds a low 2×2 plot with only the rear 2×1 covered", () => {
    const def = BUILD_CATALOG.find(b => b.id === "chicken-coop")!
    const recipe = earlyBuildingRecipe("chicken-coop")
    expect([def.w, def.d, recipe.width, recipe.depth]).toEqual([2, 2, 2, 2])
    const parts = structureParts({ ...def, buildType: def.id })
    const roof = parts.filter(p => p.layer === "roof").flatMap(p => p.vertices ?? [])
    expect(roof.length).toBeGreaterThan(0)
    expect(Math.max(...roof.filter((_, i) => i % 3 === 1))).toBeLessThan(.95)
    expect(Math.max(...roof.filter((_, i) => i % 3 === 2))).toBeLessThan(.06)
    expect(Math.min(...roof.filter((_, i) => i % 3 === 2))).toBeGreaterThanOrEqual(-1)
  })
  it("adds five hens and one rooster only on completion, preserves them on updates and removes them on demolition", () => {
    const map = buildingPreviewMap(earlyBuildingRecipe("chicken-coop")), world = { animals: [] as WildlifeAnimal[] }
    const coop = map.buildings[0]
    coop.construction = { work: 0, required: 10 }
    syncCoopChickens(world, map); expect(world.animals).toHaveLength(0)
    coop.construction.work = 10
    syncCoopChickens(world, map); expect(world.animals.map(a => a.kind)).toEqual(COOP_FLOCK)
    expect(world.animals.filter(a => a.kind !== "rooster")).toHaveLength(5)
    const original = [...world.animals]
    syncCoopChickens(world, map); expect(world.animals).toEqual(original)
    const reloaded = { animals: [] as WildlifeAnimal[] }
    syncCoopChickens(reloaded, map); expect(reloaded.animals.map(a => a.kind)).toEqual(COOP_FLOCK)
    map.buildings = []; syncCoopChickens(world, map); expect(world.animals).toHaveLength(0)
  })
  it("keeps coop residents through the normal wildlife simulation and footprint clearing", () => {
    const map = buildingPreviewMap(earlyBuildingRecipe("chicken-coop")), world = createWildlife(map, [], BASE_CHARACTER_SCALE)
    const birds = world.animals.filter(a => a.coopId)
    expect(birds).toHaveLength(6)
    const start = birds.map(a => ({ x: a.x, z: a.z }))
    for (let step = 0; step < 100; step++) stepWildlife(world, map, .05, BASE_CHARACTER_SCALE)
    birds.forEach((bird, i) => {
      expect(Math.hypot(bird.x - start[i].x, bird.z - start[i].z)).toBeLessThan(1.5)
      expect(bird.concealed).toBe(false)
      expect(bird.flight).toBeNull()
    })
  })
  for (const rotation of [0, 1, 2, 3] as const) it(`keeps chickens inside the coop footprint at rotation ${rotation}`, () => {
    const map = buildingPreviewMap(earlyBuildingRecipe("chicken-coop")), world = { animals: [] as WildlifeAnimal[] }
    const coop = map.buildings[0]; coop.rotation = rotation
    syncCoopChickens(world, map)
    const centre = coopPoint(map, coop, 0, 0), traveled = world.animals.map(() => 0)
    for (let frame = 0; frame < 1200; frame++) for (const [i, animal] of world.animals.entries()) {
      animal.age += .05
      stepCoopChicken(animal, map, .05, BASE_CHARACTER_SCALE, undefined, world.animals)
      traveled[i] += animal.distance
      const local = rotateBuildingPoint(animal.x - centre.x, animal.z - centre.z, -rotation)
      expect(Math.abs(local.x)).toBeLessThan(.95)
      expect(local.z).toBeGreaterThanOrEqual(-.7)
      if (local.z < .19) expect(animal.nesting).toBeDefined()
      expect(local.z).toBeLessThan(.84)
      expect(animal.flight).toBeNull()
    }
    expect(traveled.every(distance => distance > .1)).toBe(true)
  })
})
