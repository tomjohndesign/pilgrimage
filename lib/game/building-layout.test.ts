import { describe, expect, it } from "vitest"
import { BUILD_CATALOG } from "./balance"
import { buildingEntry, rotatedFootprint, rotateBuildingPoint, type BuildingRotation } from "./building-rotation"
import { placementLayoutSeed } from "./building-layout"
import { structureParts } from "./building-art/structure"
import { buildingSupports } from "./character-support"
import { tavernLayout, tavernWorkStop } from "./tavern-layout"
import { tavernInteriorRoute, tavernWalkingRoute, tavernWorldPoint } from "./tavern-navigation"
import type { BuildingDef, GameMap } from "./map/types"

const building = (type: string, layoutSeed?: number): BuildingDef => ({
  ...BUILD_CATALOG.find(b=>b.id===type)!, buildType:type, x:10,z:10,layoutSeed,
})

describe("repeatable building layouts", () => {
  it("keeps old layouts and reproduces a saved variation", () => {
    const old=building("house")
    expect(structureParts(old)).toEqual(structureParts({...old,layoutSeed:0}))
    const seeds=Array.from({length:8},(_,x)=>placementLayoutSeed("house",{x,z:10},42))
    expect(new Set(seeds.map(seed=>seed!%4)).size).toBe(4)
    const varied={...old,layoutSeed:seeds[0]}
    expect(structureParts(JSON.parse(JSON.stringify(varied)))).toEqual(structureParts(varied))
  })

  it.each([0,1,2,3] as BuildingRotation[])("aligns both door layouts with their reserved walking tiles at rotation %i", rotation => {
    for (const layoutSeed of [0,1,2,3]) {
      const authored=building("house",layoutSeed), placed={...authored,...rotatedFootprint(authored,rotation),rotation}
      const door=structureParts(authored).find(p=>p.name==="doorway-shadow")!
      const offset=rotateBuildingPoint(door.position[0],authored.d/2+.5,rotation)
      expect(buildingEntry(placed)).toEqual({x:placed.x+(placed.w-1)/2+offset.x,z:placed.z+(placed.d-1)/2+offset.z})
    }
  })

  it("moves hearths, windows and bedding without changing household capacity", () => {
    const parts=[0,1,2,3].map(seed=>structureParts(building("house",seed)))
    const hearths=parts.map(list=>list.find(p=>p.name==="hearth-slab")!)
    expect(hearths[0].position[0]).toBe(-hearths[1].position[0])
    const windows=parts.map(list=>list.find(p=>p.name.startsWith("window-rear-jamb-0"))!)
    expect(windows[0].vertices).not.toEqual(windows[2].vertices)
    for(const seed of [0,1,2,3]) expect(buildingSupports(building("house",seed)).filter(s=>s.clips.includes("sleeping"))).toHaveLength(2)
    const beds=[0,2].map(seed=>buildingSupports(building("house",seed)))
    expect(beds[0][0].anchor.z).not.toBe(beds[1][0].anchor.z)
    expect(Math.abs(beds[1][0].heading)).toBe(Math.PI)
  })

  it.each([0,1,2,3,4,5,9,10,18,19,26,32,64,96,128,160,255,4096,65535])("keeps tavern seats and both entrances reachable in layout %i", seed => {
    const b=building("tavern",seed), layout=tavernLayout(b.w,b.d,seed)
    const parts=structureParts(b), door=parts.find(p=>p.name==="doorway-shadow")!
    for(const table of layout.tables) expect(parts.find(p=>p.name===table.id)!.position[0]).toBe(table.x)
    for(const support of buildingSupports(b).filter(s=>s.clips.includes("sitting") && !s.id.startsWith("tavern-outside-"))) {
      expect(layout.benches.find(p=>p.id===support.id)?.x).toBeCloseTo(support.x)
      for(const side of [-1,1]) {
        const entrance=parts.find(p=>p.name===(side===1 ? "doorway-shadow" : "back-doorway-shadow"))!
        expect(tavernInteriorRoute(b,{x:entrance.position[0],z:side*(b.d/2-.16)},support.anchor,support.id)).not.toBeNull()
      }
    }
    const map: GameMap = {width:30,depth:30,tiles:Array(900).fill("grass"),buildings:[b],road:[]}
    for(const support of buildingSupports(b).filter(s=>s.id.startsWith("tavern-outside-"))) {
      const bench=layout.exteriorBenches.find(p=>p.id===support.id)!
      expect(bench.x).toBeCloseTo(support.anchor.x)
      expect(bench.z).toBeCloseTo(support.anchor.z)
      const end=support.z>0 ? 1 : -1
      const door=parts.find(p=>p.name===(end===1 ? "doorway-shadow" : "back-doorway-shadow"))!
      expect(Math.abs(bench.x-door.position[0])).toBeGreaterThan(bench.w/2+.3)
      expect(tavernWalkingRoute(map,tavernWorldPoint(map,b,layout.serving),tavernWorldPoint(map,b,support.anchor),support.id)).not.toBeNull()
    }
    for(const slot of [0,1]) for(const stop of [0,1,2,3]) {
      const point=tavernWorkStop(slot,stop,b.w,b.d,seed)
      expect(tavernInteriorRoute(b,{x:door.position[0],z:b.d/2-.16},point)).not.toBeNull()
    }
  })
})


it.each([0,1,2,3] as BuildingRotation[])("varies all three frontage tiles without losing door alignment at rotation %i", rotation => {
  for (const type of ["house","hall","tavern"]) {
    const positions=new Set<number>()
    for (const layoutSeed of [0,1,2,3,4,5]) {
      const authored={...building(type,layoutSeed),w:3,d:4}
      const placed={...authored,...rotatedFootprint(authored,rotation),rotation}
      const parts=structureParts(authored), door=parts.find(p=>p.name==="doorway-shadow")!
      positions.add(door.position[0])
      for (const end of type === "tavern" ? [1,-1] as const : [1] as const) {
        const rendered=parts.find(p=>p.name===`${end===1 ? "" : "back-"}doorway-shadow`)!
        const offset=rotateBuildingPoint(rendered.position[0],end*(authored.d/2+.5),rotation)
        expect(buildingEntry(placed,false,end)).toEqual({x:placed.x+(placed.w-1)/2+offset.x,z:placed.z+(placed.d-1)/2+offset.z})
        expect(Number.isInteger(buildingEntry(placed,false,end).x)).toBe(true)
        expect(Number.isInteger(buildingEntry(placed,false,end).z)).toBe(true)
      }
      expect(Math.abs(door.position[0])+door.size![0]/2).toBeLessThan(1.5-.13)
    }
    expect([...positions].sort()).toEqual([-1,0,1])
    expect(structureParts({...building(type),w:3}).find(p=>p.name==="doorway-shadow")!.position[0]).toBe(0)
  }
})


it("rolls front and rear door positions independently", () => {
  const pairs=[0,1,2,3,4,5,6,7,8].map(seed=>{
    const parts=structureParts(building("tavern",seed))
    return [parts.find(p=>p.name==="doorway-shadow")!.position[0],parts.find(p=>p.name==="back-doorway-shadow")!.position[0]]
  })
  expect(pairs.some(([a,b])=>a!==b)).toBe(true)
  expect(new Set(pairs.map(pair=>pair.join(","))).size).toBeGreaterThan(3)
})

it("omits house fireplaces, chimneys and shared-stack adoption for hearth-free layouts", async () => {
  const { hasDomesticHearth }=await import("./building-art/furnishings")
  const { buildingRoofJoins }=await import("./building-art/roof-joins")
  const { adoptNeighborChimney }=await import("./building-placement-layout")
  const house=building("house",81), parts=structureParts(house)
  expect(hasDomesticHearth("house",81)).toBe(false)
  expect(parts.some(p=>p.name.startsWith("hearth-") || p.name.startsWith("chimney-"))).toBe(false)
  expect(buildingSupports(house).filter(s=>s.clips.includes("sleeping"))).toHaveLength(2)
  expect(structureParts({...house,fireplace:true}).some(p=>p.name==="hearth-slab")).toBe(true)
  expect(structureParts({...house,layoutSeed:0,fireplace:false}).some(p=>p.name==="hearth-slab")).toBe(false)
  const older={...house,id:"older",layoutSeed:18,x:8}
  const map={width:30,depth:30,tiles:Array(900).fill("grass"),buildings:[older]}
  expect(adoptNeighborChimney(map,house).hearthZ).toBeUndefined()
  for(const joins of buildingRoofJoins({...map,buildings:[older,house]}).values()) expect(joins.every(j=>!j.chimney)).toBe(true)
})

it("gives every buildable form a repeatable layout and keeps reflected utility access aligned", async()=>{
  const { EARLY_BUILDINGS,earlyBuildingRecipe }=await import("./building-art/style")
  const { buildingParts }=await import("./building-art/geometry")
  const { hasBuildingLayouts }=await import("./building-layout")
  const { workshopPileOffset }=await import("./workshop-layout")
  for(const type of BUILD_CATALOG.filter(b=>!["well","watering-hole"].includes(b.id)).map(b=>b.id)) expect(EARLY_BUILDINGS.some(b=>b.id===type)).toBe(true)
  for(const preset of EARLY_BUILDINGS) {
    expect(hasBuildingLayouts(preset.id)).toBe(true)
    const recipe=earlyBuildingRecipe(preset.id), a=buildingParts({...recipe,layoutSeed:0}), b=buildingParts({...recipe,layoutSeed:1})
    expect(b,preset.id).not.toEqual(a)
    expect(buildingParts({...recipe,layoutSeed:1})).toEqual(b)
  }
  const hut=building("workshop",1)
  expect(buildingEntry(hut).x).toBe(hut.x+hut.w-1)
  for(const slot of [0,1,2,3]) expect(workshopPileOffset(slot,hut.w,hut.d,1)[0]).toBe(-workshopPileOffset(slot,hut.w,hut.d,0)[0])
})
