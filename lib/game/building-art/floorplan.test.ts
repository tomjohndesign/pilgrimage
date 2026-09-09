import { describe, expect, it } from "vitest"
import { buildingParts } from "./geometry"
import { earlyBuildingRecipe } from "./style"
import { furnitureBounds, insideRoom, overlapsFloor } from "./furniture-placement"
import { partSupports } from "../character-support"
import { tavernLayout, tavernSegmentClear } from "../tavern-layout"
import { tavernInteriorRoute } from "../tavern-navigation"
import { entranceParts } from "./entrance"

describe("furnished procedural rooms", () => {
  it("rotates complete beds and sleeping contacts while retaining the two house beds", () => {
    const headings=new Set<number>()
    for(const seed of [4,8,12,16,32,64]) {
      const recipe={...earlyBuildingRecipe("house"),width:3,depth:4,layoutSeed:seed}
      const parts=buildingParts(recipe),supports=partSupports(parts).filter(p=>p.clips.includes("sleeping"))
      expect(supports).toHaveLength(2)
      for(const support of supports) {
        headings.add(Math.round(support.heading*2/Math.PI))
        const index=support.id.slice("wool-cover-".length),bed=parts.find(p=>p.name===`straw-bed-${index}`)!
        expect(support.anchor.x).toBeCloseTo(bed.position[0])
        expect(support.anchor.z).toBeCloseTo(bed.position[2])
        expect(insideRoom(furnitureBounds([bed]),3,4,bed.rotation?.[1] ? .18 : .04)).toBe(true)
      }
    }
    expect([...headings].some(n=>Math.abs(n)%2===1)).toBe(true)
  })

  it.each(["house","hall","shelter","monk-shelter","guard-post"] as const)("adds separate furniture to larger %s rooms without intersecting other furniture", variant => {
    const recipe=earlyBuildingRecipe(variant)
    const small=buildingParts({...recipe,width:2,depth:2,layoutSeed:8})
    const large=buildingParts({...recipe,width:5,depth:5,layoutSeed:8})
    const extra=large.filter(p=>p.name.startsWith("floorplan-"))
    expect(extra.length).toBeGreaterThan(small.filter(p=>p.name.startsWith("floorplan-")).length)
    const ids=[...new Set(extra.map(p=>p.name.split("-").slice(0,2).join("-")))]
    const bounds=ids.map(id=>furnitureBounds(extra.filter(p=>p.name.startsWith(`${id}-`))))
    for(const [i,a] of bounds.entries()) {
      expect(insideRoom(a,5,5)).toBe(true)
      for(const b of bounds.slice(i+1)) expect(overlapsFloor(a,b,0)).toBe(false)
    }
  })

  it("uses rotated bar and bench footprints for rendering, serving and navigation", () => {
    for(const layoutSeed of [32,64,96,128,160,224,255,65535]) for(const [w,d] of [[3,4],[4,4],[5,5]]) {
      const layout=tavernLayout(w,d,layoutSeed)
      const building={id:"test",label:"Tavern",buildType:"tavern",w,d,x:4,z:4,height:.78,color:"tan",roofColor:"tan",layoutSeed}
      expect(tavernSegmentClear(layout.obstacles,layout.serving,layout.serving),`${w}×${d} seed ${layoutSeed}`).toBe(true)
      const parts=buildingParts({...earlyBuildingRecipe("tavern"),width:w,depth:d,layoutSeed})
      for(const item of [...layout.tables,...layout.benches,layout.counter]) {
        const bounds=furnitureBounds([parts.find(p=>p.name===item.id)!])
        for(const key of ["x","z","w","d"] as const) expect(bounds[key]).toBeCloseTo(item[key])
      }
      for(const support of partSupports(parts).filter(p=>p.clips.includes("sitting") && !p.id.startsWith("tavern-outside-"))) {
        expect(tavernInteriorRoute(building,layout.serving,support.anchor,support.id),`${w}×${d} seed ${layoutSeed} ${support.id}`).not.toBeNull()
      }
    }
    expect(tavernLayout(3,4,128).counter.yaw).not.toBe(0)
    expect(tavernLayout(5,4).tables.length).toBeGreaterThan(tavernLayout(3,4).tables.length)
    expect(tavernLayout(5,5).tables.length).toBeGreaterThan(tavernLayout(3,4).tables.length)
  })

  it("gives the material seed visible chimney, wall and entrance variations without moving doors", () => {
    for(const variant of ["house","tavern"] as const) {
      const recipes=[17,41,96].map(seed=>({...earlyBuildingRecipe(variant),seed,layoutSeed:0}))
      const models=recipes.map(buildingParts)
      for(const [i,model] of models.entries()) {
        expect(model).toEqual(buildingParts(recipes[i]))
        expect(model.find(p=>p.name==="doorway-shadow")).toEqual(models[0].find(p=>p.name==="doorway-shadow"))
      }
      for(const pattern of [/^chimney-/,/^(front|rear|side)-/]) expect(models[0].filter(p=>pattern.test(p.name))).not.toEqual(models[1].filter(p=>pattern.test(p.name)))
      expect(entranceParts(variant,.78,17)).not.toEqual(entranceParts(variant,.78,41))
      for(let seed=0;seed<50;seed++) for(const part of entranceParts(variant,.78,seed)) {
        if(part.name.startsWith("entry-sign-")) continue
        const b=furnitureBounds([part])
        expect(Math.abs(b.x)-b.w/2).toBeGreaterThanOrEqual(.24)
        expect(Math.abs(b.x)+b.w/2).toBeLessThanOrEqual(.5)
        expect(b.z-b.d/2).toBeGreaterThanOrEqual(-.5)
        expect(b.z+b.d/2).toBeLessThanOrEqual(-.26)
      }
    }
  })
})
