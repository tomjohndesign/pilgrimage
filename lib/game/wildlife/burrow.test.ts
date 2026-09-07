import { it, expect } from "vitest"
import { burrowMotion, burrowPreview, burrowApproach, BURROW_SECONDS } from "./burrow-motion"
import { createWildlifeRig } from "./rig"
import { MAMMAL_ANATOMY, limbBones } from "./anatomy"
import { createWildlife, stepWildlife } from "./simulation"
import type { GameMap } from "../map/types"

it("travels head first through one entrance without scaling or visible turn jumps",()=>{
  const start=burrowMotion(0,true),end=burrowMotion(1,true)
  expect(start.z).toBeGreaterThan(.5);expect(start.y).toBeCloseTo(0,8)
  expect(end.z).toBeLessThan(-.5);expect(end.y).toBeLessThan(-.8)
  expect(burrowPreview(.5).concealed).toBe(true)
  for(const t of [.1,.42,.58,.9,1]){
    const before=burrowPreview(t-1e-5),after=burrowPreview(t+1e-5)
    expect(Math.abs(before.z-after.z)).toBeLessThan(.00001)
    expect(Math.abs(before.y-after.y)).toBeLessThan(.00001)
    if(!before.concealed&&!after.concealed)expect(Math.abs(before.heading-after.heading)).toBeLessThan(.001)
  }
})
it("keeps fixed rabbit bones throughout entry and exit, including folded ears",()=>{
  const rig=createWildlifeRig("rabbit"),distance=(a:number[],b:number[])=>Math.hypot(...a.map((v,i)=>v-b[i]))
  for(let frame=0;frame<200;frame++){
    const phase=frame/200
    rig.pose(phase,false,0,0,false,"walk",{clip:"burrow"})
    for(const side of ["left","right"] as const)for(const rear of [false,true]){
      const joints=rig.joints(),names=rear?[`${side}Hip`,`${side}Thigh`,`${side}Knee`,`${side}Foot`]:[`${side}Shoulder`,`${side}Elbow`,`${side}Wrist`,`${side}Hand`]
      const bones=limbBones(rear?MAMMAL_ANATOMY.rabbit.hind:MAMMAL_ANATOMY.rabbit.front)
      for(let i=0;i<3;i++)expect(distance(joints[names[i] as keyof typeof joints]!.position,joints[names[i+1] as keyof typeof joints]!.position)).toBeCloseTo([bones.upper,bones.middle,bones.cannon][i],7)
    }
    expect(rig.root.scale.toArray()).toEqual([1,1,1])
  }
  rig.dispose()
})
it("aligns at the approach and applies saved entry and exit timing in the world",()=>{
  const map:GameMap={width:40,depth:40,tiles:Array(1600).fill("grass"),buildings:[],seed:12}
  const world=createWildlife(map,[]),rabbit=world.animals.find(a=>a.kind==="rabbit")!,hole=world.burrows[rabbit.burrow!],at=burrowApproach(hole)
  Object.assign(rabbit,{...at,heading:hole.heading,burrowState:"returning",target:at,rest:0})
  for(let i=0;i<40&&rabbit.burrowState==="returning";i++)stepWildlife(world,map,.1)
  expect(rabbit.burrowState).toBe("entering")
  expect(Math.cos(rabbit.heading-hole.heading)).toBeCloseTo(-1,5)
  stepWildlife(world,map,.1,1,new Set(),[],{rabbit:{version:1,clips:{burrow:{cadence:2}}}})
  expect(rabbit.shelter).toBeCloseTo(.2/BURROW_SECONDS)
  Object.assign(rabbit,{burrowState:"emerging",shelter:1,concealed:false})
  stepWildlife(world,map,.1,1,new Set(),[],{rabbit:{version:1,clips:{burrow:{cadence:.5}}}})
  expect(rabbit.shelter).toBeCloseTo(1-.05/BURROW_SECONDS)
})
