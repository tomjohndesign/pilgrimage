import { describe, expect, it } from "vitest"
import { buildingDimensions } from "./dimensions"
import { buildingPreviewMap, randomPreviewNeighbor, previewPlacement, tavernPreviewNeighbors, previewNeighbors } from "./map-preview"
import { hidePreviewPaper } from "./preview-alpha"
import { DEFAULT_RECIPE, EARLY_BUILDINGS, earlyBuildingRecipe } from "./style"
import { tileToWorldX, tileToWorldZ } from "../map/types"

describe("building map comparison", () => {
  it("centres every supported footprint on real tile boundaries and keeps the road outside it", () => {
    for (let width = 3; width <= 12; width++) for (let depth = 3; depth <= 12; depth++) {
      const map = buildingPreviewMap({ ...DEFAULT_RECIPE, width, depth })
      const building = map.buildings[0]
      expect(tileToWorldX(map, building.x) + (width - 1) / 2).toBe(0)
      expect(tileToWorldZ(map, building.z) + (depth - 1) / 2).toBe(0)
      const { wallWidth, wallDepth } = buildingDimensions({ ...DEFAULT_RECIPE, width, depth })
      for (let z = 0; z < map.depth; z++) for (let x = 0; x < map.width; x++) {
        if (Math.abs(tileToWorldX(map, x)) < wallWidth / 2 && Math.abs(tileToWorldZ(map, z)) < wallDepth / 2) expect(map.tiles[z * map.width + x]).toBe("grass")
      }
      expect(map.tiles[(building.z + depth) * map.width + Math.floor(map.width / 2)]).toBe("track")
      expect(map.road?.every(tile => tile.z >= building.z + depth)).toBe(true)
    }
  })
  it("hides border-connected paper without erasing enclosed pale plaster or dark ink", () => {
    const width = 7, pixels = new Uint8ClampedArray(width * width * 4)
    for (let y = 0; y < width; y++) for (let x = 0; x < width; x++) {
      const ink = x >= 2 && x <= 4 && y >= 2 && y <= 4 && (x === 2 || x === 4 || y === 2 || y === 4)
      pixels.set(ink ? [53, 43, 36, 255] : [243, 237, 223, 255], (y * width + x) * 4)
    }
    hidePreviewPaper(pixels, width, width)
    expect(pixels[3]).toBe(0)
    expect(pixels[(3 * width + 3) * 4 + 3]).toBe(255)
    expect(pixels[(2 * width + 3) * 4 + 3]).toBe(255)
  })
})


it("randomizes distinct neighbors without copying the edited building's footprint or materials", () => {
  for(const preset of EARLY_BUILDINGS) {
    const seen=new Set<string>()
    for(const seed of [1,2,3,4,5,6,7,8]) {
      const recipe={...earlyBuildingRecipe(preset.id),width:5,depth:5,seed:42}
      const neighbor=randomPreviewNeighbor(recipe.variant,seed)
      expect(neighbor.variant).not.toBe(recipe.variant)
      expect(neighbor).toEqual(randomPreviewNeighbor(recipe.variant,seed))
      const defaults=earlyBuildingRecipe(neighbor.variant as typeof preset.id)
      expect([neighbor.width,neighbor.depth,neighbor.seed]).toEqual([defaults.width,defaults.depth,defaults.seed])
      const map=buildingPreviewMap(recipe,neighbor),[a,b]=map.buildings
      expect(b.buildType).toBe(neighbor.variant)
      expect(b.x).toBe(a.x+a.w)
      expect(b.z+b.d).toBe(a.z+a.d)
      for(const building of map.buildings) for(let z=building.z;z<building.z+building.d;z++) for(let x=building.x;x<building.x+building.w;x++) expect(map.tiles[z*map.width+x]).toBe("grass")
      for(const view of [0,1,2,3]) expect(buildingPreviewMap({...recipe,view},neighbor)).toEqual(map)
      seen.add(neighbor.variant)
    }
    expect(seen.size).toBeGreaterThan(3)
  }
})


it("renders a tavern between two houses with exactly one shared stack", async()=>{
  const {buildingRoofJoins}=await import("./roof-joins")
  const {hasDomesticHearth}=await import("./furnishings")
  const recipe={...earlyBuildingRecipe("tavern"),layoutSeed:18},neighbors=tavernPreviewNeighbors()
  const map=buildingPreviewMap(recipe,neighbors)
  expect(map.buildings.map(b=>b.buildType)).toEqual(["tavern","house","house"])
  expect(hasDomesticHearth("house",map.buildings[1].layoutSeed,map.buildings[1].fireplace)).toBe(false)
  const joins=buildingRoofJoins(map)
  expect(joins.get("workshop")).toHaveLength(2)
  expect(joins.get("workshop")!.filter(j=>j.chimney)).toHaveLength(1)
  const stack=joins.get("workshop")!.find(j=>j.chimney)!.chimney!
  expect(stack.z+(recipe.depth-1)/2).toBe(Math.round(stack.z+(recipe.depth-1)/2))
})

it("commits the displayed snapped footprint and hearth, then restores the scene",()=>{
  const recipe={...earlyBuildingRecipe("tavern"),layoutSeed:18},map=buildingPreviewMap(recipe)
  const origin=map.buildings[0],house={...earlyBuildingRecipe("house"),layoutSeed:0,fireplace:true}
  const recipes=new Map([["workshop",recipe]])
  const at={x:origin.x+origin.w,z:origin.z+2}
  const ghost=previewPlacement(map,house,at,1,true,recipes)
  expect(ghost.error).toBeNull();expect(ghost.snapped).toBe(true)
  expect(ghost.building.rotation).toBe(0)
  expect(ghost.recipe.hearthZ).toBe(-.5)
  const placed={id:"placed",recipe:ghost.recipe,x:at.x-origin.x,z:at.z-origin.z,rotation:ghost.building.rotation!}
  const scene=JSON.parse(JSON.stringify({recipe,neighbors:[placed]}))
  const restored=buildingPreviewMap(scene.recipe,scene.neighbors)
  const building=restored.buildings[1]
  expect([building.w,building.d,building.rotation,building.hearthZ,building.layoutSeed]).toEqual([
    ghost.building.w,ghost.building.d,ghost.building.rotation,ghost.building.hearthZ,ghost.building.layoutSeed])
  expect(previewPlacement(map,house,at,1,false,recipes).building.rotation).toBe(1)
  expect(previewPlacement(map,house,{x:origin.x,z:origin.z},0,true,recipes).error).toMatch(/occupies/)
  expect(previewNeighbors({...recipe,width:5},tavernPreviewNeighbors())[1].x).toBe(5)
})
