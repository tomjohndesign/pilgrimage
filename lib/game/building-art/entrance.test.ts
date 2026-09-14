import { EARLY_BUILDINGS } from "./style"
import { describe,expect,it } from "vitest"
import { entranceParts } from "./entrance"
import { buildingDoorOffset, buildingEntry, rotatedFootprint, rotateBuildingPoint, type BuildingRotation } from "../building-rotation"
import { tavernExteriorBenches } from "./furnishings"
import { structureParts } from "./structure"
import { BUILDING_DOOR_HEIGHT, roofProfile, roofRun, singlePlaneRoofRise } from "./dimensions"

describe("door and approach proportions",()=>{
  it("leaves natural ponds without approach signage",()=>{
    expect(entranceParts("watering-hole")).toEqual([])
  })
  it.each([0,1,2,3] as BuildingRotation[])("aligns a two-tile doorway with exactly one approach tile at rotation %i",rotation=>{
    const building={x:3,z:4,...rotatedFootprint({w:2,d:3},rotation),rotation,buildType:"hall"}
    const door=rotateBuildingPoint(buildingDoorOffset(2,"hall"),2,rotation),entry=buildingEntry(building)
    expect(entry.x).toBe(building.x+(building.w-1)/2+door.x)
    expect(entry.z).toBe(building.z+(building.d-1)/2+door.z)
    const parts=structureParts({buildType:"hall",w:2,d:3,height:.78,color:"tan",roofColor:"tan"})
    expect(parts.find(p=>p.name==="doorway-shadow")!.position[0]).toBe(-.5)
    expect(parts.find(p=>p.name==="doorway-shadow")!.size![1]).toBeGreaterThanOrEqual(BUILDING_DOOR_HEIGHT)
  })
  it.each(["house","hall","market","workshop","storehouse","shrine","tavern"])("keeps %s approach props against the building and leaves the walking lane open",type=>{
    const parts=entranceParts(type)
    expect(parts.length).toBeGreaterThan(3)
    for(const part of parts) {
      const [x,y,z]=part.position,[w,h,d]=part.size!
      const overhead=["tavern","inn","market"].includes(type) && part.name.startsWith("entry-sign-")
      expect(Math.abs(x)+w/2).toBeLessThanOrEqual(.5)
      expect(z-d/2).toBeGreaterThanOrEqual(overhead ? -.67 : -.5)
      expect(z+d/2).toBeLessThanOrEqual(.5)
      if (!overhead) expect(z+d/2).toBeLessThanOrEqual(-.26)
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
    const parts=structureParts({buildType:"house",w:2,d:4,height:2.1,color:"tan",roofColor:"tan"})
    expect(parts.filter(p=>p.name.startsWith("thatch-bundle-")).some(p=>p.vertices!.some((v,i)=>i%3===1&&v>2.1))).toBe(true)
  })
})


it("hangs matching commercial signs clear of the facade and attaches the market bracket to its remaining post", () => {
  for (const type of ["tavern","inn","market"]) for (const seed of [0,1,2,3,34905]) {
    const parts=entranceParts(type, type === "market" ? .65 : 1.2,17,true,{width:3,depth:4,seed})
    const frame=parts.find(p=>p.name === "entry-sign-frame")!
    expect(frame.size).toEqual([.05,.36,.34])
    expect(frame.playerAccent).not.toBe(true)
    expect(frame.position[2]).toBeCloseTo(-.22)
    const arm=parts.find(p=>p.name === "entry-sign-arm")!
    expect(arm.size![2]).toBeLessThanOrEqual(.61)
    expect(arm.position[1]-frame.position[1]-frame.size![1]/2).toBeCloseTo(.03)
    expect(frame.position[2]-frame.size![2]/2).toBeGreaterThan(-.4)
    expect(parts.filter(p=>p.name === "entry-sign-frame")).toHaveLength(1)
    expect(parts.some(p=>p.name === "entry-sign-post")).toBe(false)
    if(type === "market") {
      const arm=parts.find(p=>p.name === "entry-sign-arm")!
      const hand=seed%2 ? -1 : 1
      expect(arm.position[0]).toBeCloseTo(.37*hand)
      expect(arm.position[2]-arm.size![2]/2).toBeCloseTo(-.63)
    }
  }
})

it("keeps tavern containers clear of exterior seats in every door and mirror layout", () => {
  for (const width of [2,3,4]) for (let seed=0;seed<24;seed++) {
    const bench=tavernExteriorBenches(width,4,seed)[1]
    const door=buildingDoorOffset(width,"tavern",seed)
    const props=entranceParts("tavern",.78,seed,true,{width,depth:4,seed})
    for(const p of props.filter(p=>p.name.startsWith("entry-cask-"))) {
      const x=p.position[0]+door
      expect(Math.abs(x-bench.x)).toBeGreaterThan((bench.w+p.size![0])/2+.03)
    }
  }
})


it.each(EARLY_BUILDINGS)("removes the old small approach sign from $name", preset => {
  const parts=entranceParts(preset.id,preset.wallHeight)
  expect(parts.some(p=>p.name === "entry-sign-post" || p.name === "entry-sign-board")).toBe(false)
  if(!["tavern","inn","market"].includes(preset.id)) expect(parts.some(p=>p.name.startsWith("entry-sign-"))).toBe(false)
})
