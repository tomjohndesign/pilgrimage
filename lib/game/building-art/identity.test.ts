import { describe, expect, it } from "vitest"
import { BUILD_CATALOG } from "../balance"
import { EARLY_BUILDINGS, earlyBuildingRecipe } from "./style"
import { buildingParts } from "./geometry"
import { structureParts, shrineStructureParts, visibleStructureParts } from "./structure"
import { playerBuildingParts } from "../player-color"
import { BUILDING_IDENTITIES } from "./identity"
import { buildingPartDetail } from "./merged-geometry"
import { entranceParts } from "./entrance"
import { waterMarkerParts } from "./water-markers"

const color = "#427da6"
describe("building recognition and ownership", () => {
  it.each(EARLY_BUILDINGS)("$name has deliberate ownership surfaces in the shared asset model", preset => {
    const parts = buildingParts(earlyBuildingRecipe(preset.id))
    const painted = playerBuildingParts(parts, color)
    expect(parts.some(part => part.playerAccent), preset.id).toBe(true)
    expect(painted.some(part => part.color === color), preset.id).toBe(true)
    parts.forEach((part, i) => {
      expect(painted[i].color).toBe(part.playerAccent ? color : part.color)
      if (part.playerAccent) expect(buildingPartDetail(part)).toBe(2)
    })
  })

  it.each(BUILD_CATALOG)("$label follows its ownership marking rule in the actual placed model", definition => {
    for (const layoutSeed of [0, 1, 34905]) {
      const parts = structureParts({ ...definition, buildType: definition.id, layoutSeed })
      expect(parts.some(part => part.playerAccent), `${definition.id}/${layoutSeed}`).toBe(definition.id !== "watering-hole")
      expect(playerBuildingParts(parts, null)).toBe(parts)
    }
  })

  it("leaves natural ponds without marker overlays", () => {
    expect(waterMarkerParts("watering-hole")).toEqual([])
  })

  it("marks both church sizes, attached residences, and an unstaffed market", () => {
    for (const parts of [shrineStructureParts(2, 2), shrineStructureParts(5, 5),
      structureParts({ ...BUILD_CATALOG.find(b => b.id === "market")!, buildType: "market", stocked: false })]) {
      expect(parts.some(p => p.playerAccent)).toBe(true)
    }
  })

  it("uses genuinely different roof materials, including at distant detail", () => {
    const roof = (type: "house" | "workshop" | "inn" | "guard-post") => buildingParts(earlyBuildingRecipe(type)).filter(p => p.layer === "roof")
    expect(roof("house").some(p => p.name.startsWith("thatch-bundle-"))).toBe(true)
    for (const type of ["workshop", "inn", "guard-post"] as const) {
      const parts = roof(type)
      expect(parts.some(p => p.name.startsWith(type === "inn" ? "shingle-course-" : "pole-roof-stick-") && buildingPartDetail(p) === 2)).toBe(true)
      expect(parts.some(p => p.name.startsWith("thatch-"))).toBe(false)
      expect(BUILDING_IDENTITIES[type].roof).not.toBe(BUILDING_IDENTITIES.house.roof)
    }
  })

  it("preserves job landmarks when storage is empty and removes foreground signage in cutaway", () => {
    for (const type of ["workshop", "storehouse", "lumberCamp", "garden", "guard-post", "sheep-pen"]) {
      const preset = EARLY_BUILDINGS.find(b => b.id === type)!
      const parts = structureParts({ buildType: type, w: preset.width, d: preset.depth, height: preset.wallHeight, color: "#887755", roofColor: "#887755", stocked: false })
      const landmarks = parts.filter(p => p.name.startsWith("identity-"))
      expect(landmarks.length, type).toBeGreaterThan(0)
      expect(landmarks.every(p => buildingPartDetail(p) === 2)).toBe(true)
      expect(visibleStructureParts(parts, true, [1, 1]).filter(p => p.name.startsWith("identity-")).every(p => p.cutawaySide?.[1] === -1)).toBe(true)
    }
  })
})

it("leaves the market's front row open while edging the rear two tiles", () => {
  const definition = BUILD_CATALOG.find(b => b.id === "market")!
  for(const layoutSeed of [0,1]) {
    const parts=structureParts({...definition,buildType:"market",layoutSeed})
    const cloth=parts.filter(p=>p.name.startsWith("market-cloth-"))
    const zs=cloth.flatMap(p=>p.vertices!.filter((_,i)=>i%3===2).map(z=>z+p.position[2]))
    expect(Math.min(...zs)).toBeCloseTo(-1.1)
    expect(Math.max(...zs)).toBeCloseTo(.1)
    expect(parts.filter(p=>p.name.startsWith("canopy-post-"))).toHaveLength(2)
    expect(parts.filter(p=>p.name.startsWith("earthfast-post-"))).toHaveLength(3)
    expect(parts.some(p=>p.name.startsWith("hitching-post-"))).toBe(false)
    expect(structureParts({...definition,buildType:"market",stocked:false}).some(p=>p.name.startsWith("market-cloth-"))).toBe(false)
  }
})

it.each(["house","inn","guard-post"] as const)("overhangs all four exposed sides of %s", type => {
  const recipe=earlyBuildingRecipe(type)
  const parts=buildingParts(recipe).filter(p=>/^(thatch|shingle|pole-roof)-/.test(p.name))
  for(const [axis,span] of [[0,recipe.width],[2,recipe.depth]]) {
    const coordinates=parts.flatMap(p=>(p.vertices ?? []).filter((_,i)=>i%3===axis).map(v=>v+p.position[axis]))
    expect(Math.min(...coordinates)).toBeLessThan(-span/2-.05)
    expect(Math.max(...coordinates)).toBeGreaterThan(span/2+.05)
  }
})

it("keeps the tavern's hanging door sign without a second roof sign", () => {
  const parts=buildingParts(earlyBuildingRecipe("tavern"))
  expect(parts.some(p=>p.name.startsWith("identity-ale-"))).toBe(false)
  expect(entranceParts("tavern").filter(p=>p.name==="entry-sign-frame")).toHaveLength(1)
})
