import { describe, expect, it } from "vitest"
import { environmentSoundField } from "./environment-sound-field"
import type { GameMap } from "./map/types"
import type { TreePlacement } from "./trees/placement"

const map:GameMap={width:5,depth:5,tiles:Array(25).fill('grass'),buildings:[],water:{depth:Array(25).fill(0),flow:{}}}

describe('local environmental sounds',()=>{
  it('distinguishes flowing water under bridges from still water and rejects remote or hidden water',()=>{
    const world=structuredClone(map)
    world.tiles[12]='bridge';world.water!.depth[12]=1;world.water!.flow[12]=[1,0]
    world.tiles[14]='water';world.water!.depth[14]=1
    const field=environmentSoundField(world,[])
    expect(field.sample(0,0,new Set(),()=>true).water?.profile).toBe('scene/stream')
    expect(field.sample(2,0,new Set(),()=>true).water?.profile).toBe('scene/shore')
    expect(field.sample(100,100,new Set(),()=>true).water).toBeUndefined()
    expect(field.sample(0,0,new Set(),()=>false).water).toBeUndefined()
  })
  it('ties birds and leaf rustle to standing visible trees and responds to felling',()=>{
    const trees:TreePlacement[]=[{x:0,y:0,z:0,species:'oak'},{x:2,y:0,z:0,species:'oak',dead:true}]
    const field=environmentSoundField(map,trees)
    expect(field.sample(0,0,new Set(),()=>true).canopy).toBeCloseTo(1/12)
    expect(field.sample(0,0,new Set([0]),()=>true).trees).toBeUndefined()
    expect(field.sample(0,0,new Set(),()=>true,false).trees).toBeUndefined()
  })
})

it('layers a nearby visible waterfall independently of a closer ordinary river tile',()=>{
 const world=structuredClone(map)
 world.water!.motion=Array(25).fill('still')
 world.water!.motion[14]='waterfall';world.water!.depth[14]=1;world.water!.flow[14]=[1,0]
 world.water!.depth[12]=1;world.water!.flow[12]=[1,0]
 const field=environmentSoundField(world,[])
 const sample=field.sample(0,0,new Set(),()=>true)
 expect(sample.water?.profile).toBe('scene/stream')
 expect(sample.waterfall?.profile).toBe('scene/waterfall')
 expect(field.sample(0,0,new Set(),p=>p.profile!=='scene/waterfall').waterfall).toBeUndefined()
 expect(field.sample(50,50,new Set(),()=>true).waterfall).toBeUndefined()
})
