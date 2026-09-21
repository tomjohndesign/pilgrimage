"use client"

import { useMemo, useRef } from "react"
import { useFrame } from "@react-three/fiber"
import type { Group } from "three"
import { BASE_CHARACTER_SCALE, DEFAULT_WALK_SPEED } from "@/lib/game/base-person/gait"
import { stepCoopChicken } from "@/lib/game/chicken-coop"
import { seekCoopEggs, stepCoopKeeper } from "@/lib/game/coop-keeper"
import { stepPenGates } from "@/lib/game/pen-gate"
import { chickenCoopDemo } from "@/lib/game/building-art/chicken-coop-demo"
import type { GameMap } from "@/lib/game/map/types"
import { TRAVELER_TYPES } from "@/lib/game/travelers"
import { CHICKEN_KINDS } from "@/lib/game/wildlife/species"
import { useAnimalRigStore } from "@/lib/game/wildlife/rig-store"
import { WildlifeBatch } from "../game/wildlife"
import { TravelerFigure } from "../game/traveler-figure"
import { PixelCharacters } from "../pixel-canvas"

/** The same nesting routes, hatch and collection chore as the game, inside the shared playground. */
export function ChickenCoopDemo({ map, demo, playbackRate=1, onEggsChange }: { map: GameMap; demo:ReturnType<typeof chickenCoopDemo>;playbackRate?:number;onEggsChange?:(waiting:number,stored:number)=>void }) {
  const batches=useMemo(()=>CHICKEN_KINDS.map(kind=>({kind,animals:demo.world.animals.filter(a=>a.kind===kind)})),[demo])
  const actors=useRef<Array<Group|null>>([]),lastCounts=useRef("")
  useFrame(({ invalidate }, delta) => {
    if (document.hidden || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const elapsed=Math.min(delta,.1)*playbackRate,edits=useAnimalRigStore.getState().designs
    const before=demo.actors.map(a=>({x:a.x,z:a.z}))
    for(let remaining=elapsed;remaining>0;) {
      const dt=Math.min(remaining,.05);remaining-=dt
      stepPenGates(demo.world,map,dt)
      for(const animal of demo.world.animals) {animal.age+=dt;stepCoopChicken(animal,map,dt,BASE_CHARACTER_SCALE,edits[animal.kind],demo.world.animals,demo.stores)}
      for(const actor of demo.actors) {
        if(!actor.coopEggs)seekCoopEggs(actor,demo.world,map,demo.stores)
        if(actor.coopEggs && !stepCoopKeeper(actor,demo.world,map,DEFAULT_WALK_SPEED,dt,demo.stores))actor.activity="idle"
      }
    }
    demo.actors.forEach((actor,i)=>{
      const group=actors.current[i];if(!group)return
      const dx=actor.x-before[i].x,dz=actor.z-before[i].z,distance=Math.hypot(dx,dz)
      group.position.set(actor.x,actor.y,actor.z)
      group.rotation.y=distance>.00001 ? Math.atan2(dx,dz) : actor.coopEggs?.heading ?? group.rotation.y
      Object.assign(group.userData,{initialized:true,phase:group.userData.phase ?? 0,distance,moving:distance>.00001,
        activity:actor.activity,heading:group.rotation.y,playbackRate,carrying:actor.coopEggs?.amount ?? 0})
    })
    const waiting=map.buildings.filter(b=>b.buildType==="chicken-coop").reduce((n,b)=>n+(demo.stores.get(b.id)?.eggs ?? 0),0)
    const stored=map.buildings.filter(b=>b.buildType==="storehouse").reduce((n,b)=>n+(demo.stores.get(b.id)?.eggs ?? 0),0)
    const key=`${waiting}:${stored}`
    if(lastCounts.current!==key){lastCounts.current=key;onEggsChange?.(waiting,stored)}
    invalidate()
  }, -2)
  return <group name="chicken-coop-demo" userData={{ animals: demo.world.animals, actors:demo.actors, stores:demo.stores }}>
    {batches.map(({kind,animals})=><WildlifeBatch key={kind} kind={kind} animals={animals} map={map} scale={BASE_CHARACTER_SCALE}/>)}
    <PixelCharacters>{demo.actors.map((actor,i)=><group key={actor.id} ref={g=>{actors.current[i]=g}}>
      <TravelerFigure resident characterModel="base" map={map} characterScale={BASE_CHARACTER_SCALE} type={TRAVELER_TYPES.peasant}/>
    </group>)}</PixelCharacters>
  </group>
}
