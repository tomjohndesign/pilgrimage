import { describe, expect, it } from "vitest"
import { syncCoopChickens } from "../chicken-coop"
import { buildingPreviewMap } from "../building-art/map-preview"
import { earlyBuildingRecipe } from "../building-art/style"
import { BASE_CHARACTER_SCALE } from "../base-person/gait"
import { createWildlife, stepWildlife, type WildlifeAnimal } from "./simulation"
import { wildlifeAnimal } from "./registry"

describe("wildlife lookup by id", () => {
  it("resolves every animal and leader by id after an earlier coop is demolished", () => {
    const map = buildingPreviewMap(earlyBuildingRecipe("chicken-coop"))
    const first = map.buildings[0]
    map.buildings = [first, { ...first, id: `${first.id}-second` }]
    const world = createWildlife(map, [], BASE_CHARACTER_SCALE)
    // A wild herd ahead of the flocks, led by its first member, as createWildlife lays it out.
    const template = world.animals.find(a => a.coopId)!
    const sheep = [0, 1, 2].map(n => ({ ...template, coopId: undefined, kind: "sheep", id: n, group: 0, leader: 0,
      x: template.x + n * .3, nesting: undefined, layIn: undefined }) as WildlifeAnimal)
    world.animals = sheep
    syncCoopChickens(world, map)
    expect(world.animals.every((a, index) => a.id === index)).toBe(true)
    const survivors = world.animals.filter(a => a.coopId === map.buildings[1].id)
    expect(survivors).toHaveLength(6)

    map.buildings = [map.buildings[1]]
    syncCoopChickens(world, map)
    // The surviving flock kept its ids but moved down the list.
    expect(world.animals.filter(a => a.coopId)).toEqual(survivors)
    expect(survivors.some(hen => world.animals[hen.id] !== hen)).toBe(true)
    for (const animal of world.animals) {
      expect(wildlifeAnimal(world.animals, animal.id)).toBe(animal)
      expect(wildlifeAnimal(world.animals, animal.leader)?.id).toBe(animal.leader)
    }
    for (const member of sheep) expect(wildlifeAnimal(world.animals, member.leader)).toBe(sheep[0])
    // A removed hen no longer resolves to anything.
    expect(wildlifeAnimal(world.animals, Math.max(...world.animals.map(a => a.id)) + 1)).toBeUndefined()

    // A rebuilt first coop gets fresh ids, and the simulation still steps.
    map.buildings = [first, ...map.buildings]
    syncCoopChickens(world, map)
    expect(new Set(world.animals.map(a => a.id)).size).toBe(world.animals.length)
    for (const animal of world.animals) expect(wildlifeAnimal(world.animals, animal.id)).toBe(animal)
    for (let step = 0; step < 20; step++) stepWildlife(world, map, .05, BASE_CHARACTER_SCALE)
  })
})
