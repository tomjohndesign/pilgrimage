import { describe, expect, it } from "vitest"
import { dirtFloorMask, FLOOR_NEIGHBOURS } from "./dirt-floor"
import { BUILD_CATALOG } from "../balance"
import { structureParts } from "./structure"
import { rotatedFootprint } from "../building-rotation"
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

  it.each([0,1,2,3])("covers the rotated footprint and only its immediately surrounding tiles (%i)", rotation => {
    const building={...hut,...rotatedFootprint(hut,rotation),rotation}, map=mapWith([building])
    const {data,tiles}=dirtFloorMask(map)
    for (let z=0;z<map.depth;z++) for (let x=0;x<map.width;x++) {
      const inside=x>=building.x && x<building.x+building.w && z>=building.z && z<building.z+building.d
      expect(data[(z*map.width+x)*4+1] === 255).toBe(inside)
      if (tiles.has(z*map.width+x)) {
        expect(x).toBeGreaterThanOrEqual(building.x-1)
        expect(x).toBeLessThanOrEqual(building.x+building.w)
        expect(z).toBeGreaterThanOrEqual(building.z-1)
        expect(z).toBeLessThanOrEqual(building.z+building.d)
      }
    }
    const west=(building.z*map.width+building.x-1)*4
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
    expect(dirtFloorMask(map).tiles.size).toBe(0)
    map.buildings.push({...hut,z:7})
    map.tiles[6*map.width+3]="water"
    expect(dirtFloorMask(map).tiles.has(6*map.width+3)).toBe(false)
  })
})
