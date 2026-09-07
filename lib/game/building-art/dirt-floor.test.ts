import { describe, expect, it } from "vitest"
import { dirtFloorMask, FLOOR_NEIGHBOURS } from "./dirt-floor"
import { BUILD_CATALOG } from "../balance"
import { structureParts } from "./structure"
import { buildingApproaches, buildingApproach, rotatedFootprint, type BuildingRotation } from "../building-rotation"
import type { GameMap } from "../map/types"

const hut = { id: "hut", buildType: "workshop", label: "Hut", x: 3, z: 3, w: 3, d: 2, height: .85, color: "tan", roofColor: "tan" }
const mapWith = (buildings = [hut]): GameMap => ({ width: 12, depth: 12, tiles: Array(144).fill("grass"), buildings })

describe("shared path dirt for building floors", () => {
  it("marks earth floors across the catalogue, preserving raised timber and paving", () => {
    for (const definition of BUILD_CATALOG) {
      const parts=structureParts({...definition,buildType:definition.id})
      expect(parts.find(p=>p.name === "floor")?.surface === "trail").toBe(definition.id !== "storehouse")
    }
    expect(structureParts({...hut,buildType:"enclosure"}).find(p=>p.name === "floor")?.surface).toBeUndefined()
  })

  it.each([0,1,2,3] as BuildingRotation[])("covers the rotated footprint, its entrance tile and their worn borders (%i)", rotation => {
    const building={...hut,...rotatedFootprint(hut,rotation),rotation}, map=mapWith([building])
    const {data,tiles}=dirtFloorMask(map), entry=buildingApproach(map,building)!
    for (let z=0;z<map.depth;z++) for (let x=0;x<map.width;x++) {
      const inside=x>=building.x && x<building.x+building.w && z>=building.z && z<building.z+building.d
      expect(data[(z*map.width+x)*4+1] === 255).toBe(inside || x===entry.x && z===entry.z)
      if (tiles.has(z*map.width+x)) {
        expect(x).toBeGreaterThanOrEqual(Math.min(building.x,entry.x)-1)
        expect(x).toBeLessThanOrEqual(Math.max(building.x+building.w,entry.x+1))
        expect(z).toBeGreaterThanOrEqual(Math.min(building.z,entry.z)-1)
        expect(z).toBeLessThanOrEqual(Math.max(building.z+building.d,entry.z+1))
      }
    }
    const west=(building.z*map.width+Math.min(building.x,entry.x)-1)*4
    expect(data[west] & 1<<FLOOR_NEIGHBOURS.findIndex(([x,z])=>x===1 && z===0)).not.toBe(0)
  })

  it("unions touching dirt floors without exposing an internal seam", () => {
    const map=mapWith([hut,{...hut,id:"next",x:6}]), {data}=dirtFloorMask(map)
    expect(data[(3*map.width+5)*4+1]).toBe(255)
    expect(data[(3*map.width+6)*4+1]).toBe(255)
  })

  it("leaves shrine paving, raised stores and water unchanged", () => {
    const map=mapWith([{...hut,id:"shrine"},{...hut,id:"store",buildType:"storehouse",x:7}])
    map.site={hovelId:"shrine",door:{x:3,z:6},junction:0,branch:[]}
    const mask=dirtFloorMask(map)
    for(const b of map.buildings) {
      expect(mask.data[(b.z*map.width+b.x)*4+1]).toBe(0)
      const entry=buildingApproach(map,b)!
      expect(mask.data[(entry.z*map.width+entry.x)*4+2]).toBe(255)
    }
    map.buildings.push({...hut,z:7})
    map.tiles[6*map.width+3]="water"
    expect(dirtFloorMask(map).tiles.has(6*map.width+3)).toBe(false)
  })
})

it.each([0,1,2,3] as BuildingRotation[])("paints both tavern approaches at rotation %i",rotation=>{
  const tavern={...hut,buildType:"tavern",...rotatedFootprint({w:3,d:4},rotation),rotation}
  const map=mapWith([tavern]),mask=dirtFloorMask(map)
  for(const entry of buildingApproaches(map,tavern)) {
    expect(mask.data[(entry.z*map.width+entry.x)*4+1]).toBe(255)
    expect(mask.data[(entry.z*map.width+entry.x)*4+2]).toBe(255)
  }
})
