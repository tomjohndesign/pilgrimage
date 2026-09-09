import { expect, it } from "vitest"
import { adoptNeighborChimney, roofAlignedRotation, placementClearance } from "./building-placement-layout"
import { buildingRoofJoins } from "./building-art/roof-joins"
import { structureParts } from "./building-art/structure"
import { rotateBuildingPoint, rotatedFootprint, type BuildingRotation } from "./building-rotation"
import type { BuildingDef, GameMap } from "./map/types"

const house: BuildingDef={id:"old",buildType:"house",label:"Home",x:10,z:10,w:3,d:4,height:.7,color:"tan",roofColor:"tan",layoutSeed:18}
const mapFor=(...buildings: BuildingDef[]): GameMap=>({width:50,depth:50,tiles:Array(2500).fill("grass"),buildings})

it("moves the fireplace along the side wall without changing the shell",()=>{
  const positions=[0,9,18].map(layoutSeed=>structureParts({...house,layoutSeed}).find(p=>p.name==="hearth-slab")!.position)
  expect(new Set(positions.map(p=>p[2])).size).toBe(3)
  expect(positions[2][2]).toBe(.5)
  for(const position of positions) expect(Math.abs(position[0])).toBeCloseTo(1.14)
})

it.each([0,1,2,3] as BuildingRotation[])("adopts an existing middle-wall fireplace at rotation %i and preserves it after demolition", rotation=>{
  const turn=(b: BuildingDef)=>{
    const center=rotateBuildingPoint(b.x+b.w/2,b.z+b.d/2,rotation),size=rotatedFootprint(b,rotation)
    return {...b,...size,rotation,x:25+center.x-size.w/2,z:25+center.z-size.d/2}
  }
  const older=turn(house), initial=turn({...house,id:"new",x:13,layoutSeed:0}), map=mapFor(older)
  const adopted=adoptNeighborChimney(map,initial), next={...initial,...adopted}
  expect(adopted.layoutSeed!%2).toBe(1); expect(adopted.hearthZ).toBeCloseTo(.5)
  expect(map.buildings).toEqual([older])
  const joins=buildingRoofJoins(mapFor(older,next))
  expect(joins.get(older.id)![0].chimney?.z).toBeCloseTo(.5)
  expect(joins.get(next.id)![0].chimney?.z).toBeCloseTo(.5)
  const local={...next,...rotatedFootprint(next,rotation)}, saved=JSON.parse(JSON.stringify(local))
  const fireplace=structureParts(local,joins.get(next.id)).find(p=>p.name==="hearth-slab")
  expect(structureParts(saved).find(p=>p.name==="hearth-slab")).toEqual(fireplace)
})

it("does not adopt a chimney on the far side or across a gap",()=>{
  const next={...house,id:"new",x:13,layoutSeed:0}
  expect(adoptNeighborChimney(mapFor({...house,layoutSeed:19}),next).hearthZ).toBeUndefined()
  expect(adoptNeighborChimney(mapFor(house),{...next,x:14}).hearthZ).toBeUndefined()
})

it("reuses the existing world position across unequal but compatible footprints",()=>{
  const older={...house,w:2,d:2,z:12}, initial={...house,id:"new",buildType:"tavern",x:12,z:10,layoutSeed:0}
  const next={...initial,...adoptNeighborChimney(mapFor(older),initial)}
  expect(next.hearthZ).toBeCloseTo(1.5)
  const joins=buildingRoofJoins(mapFor(older,next))
  expect(joins.get(older.id)![0].chimney?.z).toBeCloseTo(.5)
  expect(joins.get(next.id)![0].chimney?.z).toBeCloseTo(1.5)
  expect(structureParts(next).find(p=>p.name==="hearth-slab")!.position[2]).toBeCloseTo(1.5)
})

it("retains a real adopted fireplace when mirroring crosses a hearth-free seed boundary",()=>{
  const next={...house,id:"new",x:13,layoutSeed:80}
  const adopted={...next,...adoptNeighborChimney(mapFor(house),next)}
  expect(adopted.layoutSeed).toBe(81)
  expect(adopted.fireplace).toBe(true)
  expect(structureParts(adopted).some(p=>p.name==="hearth-slab")).toBe(true)
  expect(buildingRoofJoins(mapFor(house,adopted)).get(house.id)![0].chimney).toBeDefined()
})


it("keeps every along-wall hearth on a tile centre, including adopted positions", async()=>{
  const {shelterHearth,hasDomesticHearth}=await import("./building-art/furnishings")
  for(let depth=1;depth<=5;depth++) for(const seed of [0,9,18,27,42,65535]) {
    for(const hearthZ of [undefined,0,.14,-.64,.68]) {
      const hearth=shelterHearth(3,depth,.7,.64,seed,hearthZ)
      expect(Number.isInteger(hearth.z+(depth-1)/2)).toBe(true)
      expect(Math.abs(hearth.z)).toBeLessThanOrEqual((depth-1)/2)
    }
  }
  expect(Array.from({length:108},(_,seed)=>hasDomesticHearth("house",seed)).filter(v=>!v)).toHaveLength(27)
})

it("snaps new roofs to compatible neighbors, keeps valid orientations, and leaves remote placements alone",()=>{
  const map=mapFor(house)
  const next={...house,id:"new",x:13,z:12,w:2,d:2,rotation:1 as const,layoutSeed:0}
  const rotation=roofAlignedRotation(map,next)
  expect(rotation).toBe(0)
  const aligned={...next,rotation}
  expect(placementClearance(map,aligned)).toBeNull()
  expect(buildingRoofJoins(mapFor(house,aligned)).get(next.id)).toHaveLength(1)
  expect(roofAlignedRotation(map,aligned)).toBe(0)
  expect(roofAlignedRotation(map,{...next,x:30})).toBe(1)
  expect(roofAlignedRotation(map,next,undefined,()=>false)).toBe(1)
})

it("snaps a rectangular footprint and preserves entrances in every world orientation",()=>{
  const old={...house,w:2,d:2,x:10,z:12}
  for(const rotation of [0,1,2,3] as BuildingRotation[]) {
    const turn=(b:BuildingDef)=>{
      const center=rotateBuildingPoint(b.x+b.w/2-10,b.z+b.d/2-10,rotation),size=rotatedFootprint(b,rotation)
      return {...b,...size,rotation,x:20+center.x-size.w/2,z:20+center.z-size.d/2}
    }
    const a=turn(old),b=turn({...house,id:"new",buildType:"tavern",x:12,z:10,layoutSeed:0})
    const requested=((rotation+1)%4) as BuildingRotation
    const candidate={...b,...rotatedFootprint({w:3,d:4},requested),rotation:requested}
    const aligned=roofAlignedRotation(mapFor(a),candidate)
    const final={...candidate,...rotatedFootprint({w:3,d:4},aligned),rotation:aligned}
    expect(buildingRoofJoins(mapFor(a,final)).get(final.id)).toBeDefined()
    expect(placementClearance(mapFor(a),final)).toBeNull()
  }
})
