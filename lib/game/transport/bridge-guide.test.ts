import { describe,it,expect } from "vitest"
import { turningMap } from "./turning-demo"
import { roadCartPose,cartGroundContacts,onBridgeDeck } from "./bridge-guide"
import { cartOffset } from "./assets"
import { bridgeLayout } from "../map/bridges"
import { BASE_CHARACTER_SCALE } from "../base-person/gait"
import { walkingSurface } from "../map/walking-surface"
import { cartRoutePoint } from "./route"

describe("bridge cart assist",()=>{
  it.each(["short_bridge","compound_bridge","bridge","bridge_exit"] as const)("supports both wheels across %s in either direction",scenario=>{
    for(const puller of ["hand","donkey","horse"] as const)for(const direction of [1,-1] as const){
      const map=turningMap(scenario),layout=bridgeLayout(map),wheelbase=-cartOffset(puller)*BASE_CHARACTER_SCALE
      const start=direction===1?0:map.road!.length-1
      let previous=roadCartPose(map,start,direction,wheelbase,BASE_CHARACTER_SCALE),samples=0
      for(let d=.025;d<map.road!.length-1;d+=.025){
        const p=start+direction*d,pose=roadCartPose(map,p,direction,wheelbase,BASE_CHARACTER_SCALE,previous)
        expect(Math.hypot(pose.x-pose.hitch.x,pose.z-pose.hitch.z)).toBeLessThanOrEqual(wheelbase+1e-7)
        expect(Math.hypot(pose.x-previous.x,pose.z-previous.z),`${scenario} ${puller} ${direction} p=${p}`).toBeLessThan(.1)
        const turn=Math.abs(Math.atan2(Math.sin(pose.heading-previous.heading),Math.cos(pose.heading-previous.heading)))
        expect(turn,`${scenario} ${puller} ${direction} p=${p} heading jump`).toBeLessThan(.3)
        if(pose.bridgeGuided){
          const dx=pose.x-previous.x,dz=pose.z-previous.z
          // Its fixed wheels roll in the body's facing direction even when
          // the horse has already rounded the bend. Include entry/exit blends.
          expect(Math.abs(dx*Math.cos(pose.heading)-dz*Math.sin(pose.heading))).toBeLessThan(1e-8)
          expect(dx*Math.sin(pose.heading)+dz*Math.cos(pose.heading)).toBeGreaterThanOrEqual(0)
        }
        for(const w of cartGroundContacts(pose,BASE_CHARACTER_SCALE)){
          const tx=w.x+(map.width-1)/2,tz=w.z+(map.depth-1)/2
          // Include the sloped approaches, not just the level span.
          const nearest=map.road!.reduce((best,t,i)=>Math.hypot(t.x-tx,t.z-tz)<best.distance?{i,distance:Math.hypot(t.x-tx,t.z-tz)}:best,{i:0,distance:Infinity})
          const t=map.road![nearest.i]
          if(layout.rise[t.z*map.width+t.x]>0){samples++;expect(onBridgeDeck(map,w.x,w.z),`${scenario} ${puller} ${direction} p=${p} wheel=${tx},${tz}`).toBe(true)}
        }
        expect(Math.abs(walkingSurface(map,pose.x,pose.z).height-walkingSurface(map,previous.x,previous.z).height)).toBeLessThan(.08)
        previous=pose
      }
      expect(samples).toBeGreaterThan(20)
    }
  })
  it.each([1,-1] as const)("turns independently after the horse clears a short bend in direction %i",direction=>{
    const map=turningMap("short_bridge"),wheelbase=-cartOffset("horse")*BASE_CHARACTER_SCALE
    const start=direction===1?0:map.road!.length-1
    let pose=roadCartPose(map,start,direction,wheelbase,BASE_CHARACTER_SCALE),independent=0
    for(let d=.01;d<map.road!.length-1;d+=.01){
      const progress=start+direction*d
      pose=roadCartPose(map,progress,direction,wheelbase,BASE_CHARACTER_SCALE,pose)
      const before=cartRoutePoint(map,progress-direction*.001),after=cartRoutePoint(map,progress+direction*.001)
      const horseHeading=Math.atan2(after.x-before.x,after.z-before.z)
      const difference=Math.abs(Math.atan2(Math.sin(pose.heading-horseHeading),Math.cos(pose.heading-horseHeading)))
      if(pose.bridgeGuided&&difference>Math.PI/3)independent++
    }
    expect(independent).toBeGreaterThan(20)
  })
  it("holds the corrected pose still while paused",()=>{
    const map=turningMap("short_bridge"),wheelbase=-cartOffset("horse")*BASE_CHARACTER_SCALE
    const pose=roadCartPose(map,11,1,wheelbase,BASE_CHARACTER_SCALE)
    let stopped=pose
    for(let i=0;i<100;i++)stopped=roadCartPose(map,11,1,wheelbase,BASE_CHARACTER_SCALE,stopped)
    expect(stopped).toEqual({...pose,distance:0})
  })

})
