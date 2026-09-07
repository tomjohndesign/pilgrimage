import { it, expect } from "vitest"
import { createWildlifeRig } from "./rig"
import { animalPoseKey, EMPTY_ANIMAL_EDITS, validateAnimalEdits } from "./rig-edits"
import { birdGlide } from "./motion"

for(const kind of ["hawk","sparrow"] as const) {
  it(`${kind} glides with held wings and an editable wrist, then resumes flapping`,()=>{
    const rig=createWildlifeRig(kind),wrist=rig.root.getObjectByName("left-wing-wrist")!
    const poses=[]
    for(const phase of [0,.25,.5,.75]){
      rig.pose(phase,true,phase*10,0,true,"walk",{clip:"glide"})
      poses.push(structuredClone(rig.joints()))
      expect(wrist.rotation.z).toBeCloseTo(0,8)
    }
    for(const pose of poses.slice(1))expect(pose).toEqual(poses[0])
    const edits=animalPoseKey(EMPTY_ANIMAL_EDITS,"glide","leftWingWrist",{frame:0,radius:4,offset:[0,.3,0]},0)
    expect(validateAnimalEdits(edits)).toEqual(edits)
    rig.pose(0,true,0,0,true,"walk",{clip:"glide",edits})
    expect(rig.joints().leftWing!.position).not.toEqual(poses[0].leftWing!.position)
    rig.pose(.3,true,0,0,true,"walk",{clip:"fly"})
    expect(Math.abs(wrist.rotation.z)).toBeGreaterThan(.1)
    const first=wrist.rotation.z
    rig.pose(.7,true,0,0,true,"walk",{clip:"fly"})
    expect(wrist.rotation.z*first).toBeLessThan(0)
    rig.dispose()
  })
}
it("limits natural glides to cruise, with shorter sparrow intervals",()=>{
  for(const kind of ["hawk","sparrow"] as const){
    expect(birdGlide(kind,0,20)).toBe(0)
    expect(birdGlide(kind,19.9,20)).toBe(0)
  }
  const samples=(kind:"hawk"|"sparrow")=>Array.from({length:1000},(_,i)=>birdGlide(kind,i/50,20)).filter(v=>v>.99).length
  expect(samples("hawk")).toBeGreaterThan(samples("sparrow"))
  expect(samples("sparrow")).toBeGreaterThan(0)
})
