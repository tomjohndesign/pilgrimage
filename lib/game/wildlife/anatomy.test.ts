import { describe, expect, it } from "vitest"
import { MAMMAL_ANATOMY, type MammalKind } from "./anatomy"
import { createWildlifeRig } from "./rig"
import { animalPoseKey, EMPTY_ANIMAL_EDITS } from "./rig-edits"

const distance=(a:number[],b:number[])=>Math.hypot(...a.map((v,i)=>v-b[i]))
describe("mammal construction and anatomical bind pose",()=>{
  for(const kind of Object.keys(MAMMAL_ANATOMY) as MammalKind[]) it(`${kind} renders the authored standing skeleton under a connected hide`,()=>{
    const a=MAMMAL_ANATOMY[kind],rig=createWildlifeRig(kind)
    rig.pose(0,false,0,0)
    for(const [index,limb] of [a.front,a.front,a.hind,a.hind].entries()) {
      const side=index%2?"right":"left",suffixes=index>=2?["Hip","Thigh","Knee","Foot"]:["Shoulder","Elbow","Wrist","Hand"]
      for(let joint=0;joint<4;joint++) {
        const position=rig.joints()[`${side}${suffixes[joint]}` as keyof ReturnType<typeof rig.joints>]!.position
        const bind=limb.points[joint].map((v,axis)=>axis===0&&index%2?-v:v)
        expect(distance(position,bind),`${kind} ${side} ${suffixes[joint]}`).toBeLessThan(.00001)
      }
    }
    expect(distance(rig.joints().neck!.position,a.neck.base)).toBeLessThan(.00001)
    expect(distance(rig.joints().head!.position,a.neck.poll)).toBeLessThan(.00001)
    expect(rig.joints().leftScapula).toBeDefined()
    const hide=rig.parts.find(part=>part.name==="continuous-body-hide")!
    expect(hide.geometry.index).not.toBeNull()
    expect(hide.geometry.attributes.position.count).toBeGreaterThan(200)
    const boneLength=distance(a.neck.base,a.neck.poll)
    const edits=animalPoseKey(EMPTY_ANIMAL_EDITS,"idle","head",{frame:0,radius:4,offset:[.1,.1,.1]},0)
    rig.pose(0,false,0,0,false,"walk",{edits})
    expect(distance(rig.joints().neck!.position,rig.joints().head!.position)).toBeCloseTo(boneLength,8)
    expect(rig.joints().neck!.position).toEqual(a.neck.base)
    rig.dispose()
  })
  it("uses the same mesh and pose in the construction and coat views",()=>{
    for(const kind of Object.keys(MAMMAL_ANATOMY) as MammalKind[]) {
      const coat=createWildlifeRig(kind),construction=createWildlifeRig(kind,true)
      coat.pose(0,false,0,0);construction.pose(0,false,0,0)
      expect(construction.joints()).toEqual(coat.joints())
      expect(construction.parts.map(p=>Array.from(p.geometry.attributes.position.array))).toEqual(coat.parts.map(p=>Array.from(p.geometry.attributes.position.array)))
      coat.dispose();construction.dispose()
    }
  })
})
