import { describe,expect,it } from "vitest"
import { entranceParts } from "./entrance"
import { buildingDoorOffset, buildingEntry, rotatedFootprint, rotateBuildingPoint, type BuildingRotation } from "../building-rotation"
import { structureParts } from "./structure"
import { BUILDING_DOOR_HEIGHT, roofProfile, roofRun, singlePlaneRoofRise } from "./dimensions"

describe("door and approach proportions",()=>{
  it.each([0,1,2,3] as BuildingRotation[])("aligns a two-tile doorway with exactly one approach tile at rotation %i",rotation=>{
    const building={x:3,z:4,...rotatedFootprint({w:2,d:3},rotation),rotation,buildType:"hall"}
    const door=rotateBuildingPoint(buildingDoorOffset(2,"hall"),2,rotation),entry=buildingEntry(building)
    expect(entry.x).toBe(building.x+(building.w-1)/2+door.x)
    expect(entry.z).toBe(building.z+(building.d-1)/2+door.z)
    const parts=structureParts({buildType:"hall",w:2,d:3,height:.78,color:"tan",roofColor:"tan"})
    expect(parts.find(p=>p.name==="doorway-shadow")!.position[0]).toBe(-.5)
    expect(parts.find(p=>p.name==="doorway-shadow")!.size![1]).toBeGreaterThanOrEqual(BUILDING_DOOR_HEIGHT)
  })
  it.each(["shepherd-hut","hall","market","workshop","storehouse","shrine","tavern"])("keeps %s approach props against the building and leaves the walking lane open",type=>{
    const parts=entranceParts(type)
    expect(parts.length).toBeGreaterThan(3)
    for(const part of parts) {
      const [x,y,z]=part.position,[w,h,d]=part.size!
      const overhead=type==="tavern" && part.name.startsWith("entry-sign-")
      expect(Math.abs(x)+w/2).toBeLessThanOrEqual(.5)
      expect(z-d/2).toBeGreaterThanOrEqual(overhead ? -.67 : -.5)
      expect(z+d/2).toBeLessThanOrEqual(.5)
      expect(z+d/2).toBeLessThanOrEqual(-.26)
      if(overhead) expect(y-h/2).toBeGreaterThan(BUILDING_DOOR_HEIGHT)
      else expect(Math.abs(x)-w/2).toBeGreaterThanOrEqual(.24)
    }
  })
  it("joins two house slopes back to back across a four-tile building",()=>{
    const rise=singlePlaneRoofRise(4),profile=roofProfile(4,rise)
    expect(rise).toBe(singlePlaneRoofRise(2))
    expect(profile.height(2)).toBe(0)
    expect(profile.height(0)).toBeCloseTo(.64)
    expect(profile.height(-2)).toBe(0)
    for(const z of [0,.5,1,1.5,2]) expect(profile.height(z)).toBeCloseTo(profile.height(-z))
  })
  it("turns roofs downhill within two tiles without imposing a height cap",()=>{
    for(const depth of [1,2,3,4,5,8]) expect(roofRun(depth)).toBeLessThanOrEqual(2)
    const parts=structureParts({buildType:"shepherd-hut",w:2,d:4,height:2.1,color:"tan",roofColor:"tan"})
    expect(parts.filter(p=>p.name.startsWith("thatch-bundle-")).some(p=>p.vertices!.some((v,i)=>i%3===1&&v>2.1))).toBe(true)
  })
})
