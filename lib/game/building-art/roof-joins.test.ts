import { describe, expect, it } from "vitest"
import { buildingRoofJoins, joinedRoofHeight, roofOutlineOwners } from "./roof-joins"
import { structureParts } from "./structure"
import { rotateBuildingPoint, rotatedFootprint, type BuildingRotation } from "../building-rotation"
import type { BuildingDef, GameMap } from "../map/types"

const house: BuildingDef = { id: "house", buildType: "house", label: "House", x: 10, z: 12,
  w: 2, d: 2, height: .70, color: "#8c7658", roofColor: "#a59164" }
const tavern: BuildingDef = { ...house, id: "tavern", buildType: "tavern", x: 12, z: 10, w: 3, d: 4, height: .78 }
const mapFor = (...buildings: BuildingDef[]): GameMap => ({ width: 40, depth: 40, tiles: Array(1600).fill("grass"), buildings })

describe("connected domestic roofs", () => {
  it.each([0, 1, 2, 3] as BuildingRotation[])("joins a short house to a tavern at rotation %i", rotation => {
    const turn = (b: BuildingDef) => {
      const center = rotateBuildingPoint(b.x+b.w/2-12, b.z+b.d/2-12, rotation)
      const size = rotatedFootprint(b, rotation)
      return { ...b, ...size, rotation, x: 20+center.x-size.w/2, z: 20+center.z-size.d/2 }
    }
    const a=turn(house), b=turn(tavern), map=mapFor(a,b), joins=buildingRoofJoins(map)
    expect(joins.get(a.id)).toHaveLength(1)
    expect(joins.get(b.id)).toHaveLength(1)
    const aj=joins.get(a.id)![0], bj=joins.get(b.id)![0]
    expect([aj.side,aj.from,aj.to]).toEqual([1,-1,1])
    expect([bj.side,bj.from,bj.to]).toEqual([-1,0,2])
    for (const z of [-1,-.5,0,.5,1]) expect(joinedRoofHeight(aj,z)).toBeCloseTo(joinedRoofHeight(bj,z+1))
    expect(roofOutlineOwners(map.buildings,joins)).toEqual([0,0])
  })

  it("closes the straw to the exact common plane, including reflected layouts", () => {
    for (const layoutSeed of [0,1,2,3]) {
      const a={...house,layoutSeed}, joins=buildingRoofJoins(mapFor(a,tavern)), edge=joins.get(a.id)![0]
      const parts=structureParts(a,joins.get(a.id))
      const contact=parts.filter(p=>p.name.startsWith("thatch-bundle-")).flatMap(p=>
        Array.from({length:p.vertices!.length/3},(_,i)=>p.vertices!.slice(i*3,i*3+3)))
        .filter(([x])=>Math.abs(x-a.w/2)<1e-6)
      expect(contact.length).toBeGreaterThan(0)
      for(const [,y,z] of contact) expect(y,`seed ${layoutSeed}, z ${z}`).toBeCloseTo(joinedRoofHeight(edge,z)+.088,5)
      const verges=parts.filter(p=>p.name.startsWith("thatch-verge-"))
      expect(verges.some(p=>p.vertices!.every((v,i)=>i%3!==0 || Math.abs(v-a.w/2)<1e-6))).toBe(false)
      expect(parts.some(p=>p.name.startsWith(`window-side-${layoutSeed%2 ? -.87 : .87}`))).toBe(false)
      expect(new Set(parts.map(p=>p.name)).size).toBe(parts.length)
    }
  })

  it("leaves corners, gaps, different pitches and unfinished roofs separate", () => {
    for (const other of [
      {...house,id:"other",x:12,z:14}, {...house,id:"other",x:13},
      {...house,id:"other",x:12,height:1.2}, {...house,id:"other",x:12,rotation:1 as const},
      {...house,id:"other",x:12,construction:{work:1,required:2}},
      {...house,id:"other",x:12,rotation:2 as const},
    ]) expect(buildingRoofJoins(mapFor(house,other)).size).toBe(0)
  })

  it("restores standalone roofs after removal and groups a row independently of input order", () => {
    const row=[house,{...house,id:"middle",x:12},{...house,id:"end",x:14}]
    const joined=buildingRoofJoins(mapFor(...row))
    expect(joined.get("middle")).toHaveLength(2)
    expect(roofOutlineOwners(row,joined)).toEqual([0,0,0])
    const reversed=[...row].reverse()
    expect(roofOutlineOwners(reversed,buildingRoofJoins(mapFor(...reversed)))).toEqual([0,0,0])
    const alone=buildingRoofJoins(mapFor(house))
    expect(alone.size).toBe(0)
    expect(structureParts(house,alone.get(house.id))).toEqual(structureParts(house))
  })
})

it.each([0, 1, 2, 3] as BuildingRotation[])("shares two flues and fills the party wall at rotation %i", rotation => {
  const turn = (b: BuildingDef) => {
    const center = rotateBuildingPoint(b.x+b.w/2, b.z+b.d/2, rotation), size = rotatedFootprint(b, rotation)
    return { ...b, ...size, rotation, x: 20+center.x-size.w/2, z: 20+center.z-size.d/2 }
  }
  const a=turn({...house,layoutSeed:0}), b=turn({...house,id:"other",x:12,layoutSeed:1})
  const joins=buildingRoofJoins(mapFor(a,b)), aj=joins.get(a.id)![0], bj=joins.get(b.id)![0]
  expect(aj.chimney).toBeDefined(); expect(bj.chimney).toBeDefined()
  const world = (b: BuildingDef, x: number,z: number) => {
    const p=rotateBuildingPoint(x,z,b.rotation)
    return [p.x+b.x+b.w/2,p.z+b.z+b.d/2]
  }
  expect(world(a,aj.chimney!.x,aj.chimney!.z)).toEqual(world(b,bj.chimney!.x,bj.chimney!.z))
  expect(aj.chimney!.top).toBe(bj.chimney!.top)
  for (const building of [a,b]) {
    const joined=structureParts(building,joins.get(building.id)), alone=structureParts(building)
    expect(joined.find(p=>p.name==="hearth-slab")).toEqual(alone.find(p=>p.name==="hearth-slab"))
    const mouth=joined.filter(p=>p.name==="shared-chimney-mouth")
    expect(mouth).toHaveLength(1); expect(mouth[0].layer).toBe("roof")
    expect(joined.filter(p=>p.name.startsWith("party-wall-"))).toHaveLength(1)
    expect(joined.some(p=>p.name.startsWith("party-infill-"))).toBe(true)
    expect(alone.some(p=>p.name.startsWith("shared-chimney-"))).toBe(false)
  }
})

it("keeps remote hearths separate even under a joined roof", () => {
  const b={...house,id:"other",x:12,layoutSeed:0}
  const joins=buildingRoofJoins(mapFor(house,b))
  expect(joins.size).toBe(2)
  for (const edges of joins.values()) expect(edges[0].chimney).toBeUndefined()
})
