"use client"

import { useMemo, useRef } from "react"
import { useFrame } from "@react-three/fiber"
import type { Group } from "three"
import { PixelCharacters } from "../pixel-canvas"
import { TravelerFigure } from "../game/traveler-figure"
import { WildlifeBatch } from "../game/wildlife"
import { seekPenFood, stepPenFood } from "@/lib/game/pen-food"
import { PenFoodStock } from "../game/pen-food-stock"
import { buildingCentre } from "@/lib/game/buildings"
import { buildingYaw, rotatedFootprint } from "@/lib/game/building-rotation"
import { SheepRemains } from "../game/sheep-remains"
import { SheepLeads } from "../game/sheep-leads"
import { BASE_CHARACTER_SCALE, DEFAULT_WALK_SPEED, walkSpeedScale } from "@/lib/game/base-person/gait"
import { travelerAppearance } from "@/lib/game/base-person/population"
import { populationVisual } from "@/lib/game/base-person/population-assets"
import { usePopulationStore } from "@/lib/game/base-person/population-store"
import { sheepPenDemo } from "@/lib/game/building-art/sheep-pen-demo"
import { seekSheep, stepShepherd } from "@/lib/game/herding"
import { seekPenCare, stepShepherdCare, shepherdVisualActivity } from "@/lib/game/sheep-husbandry"
import { jobVisual } from "@/lib/game/jobs/assets"
import type { GameMap } from "@/lib/game/map/types"
import { TRAVELER_TYPES } from "@/lib/game/travelers"
import { useAnimalRigStore } from "@/lib/game/wildlife/rig-store"
import { WILDLIFE_STEP_SECONDS } from "@/lib/game/wildlife/pose-timing"
import { stepWildlife } from "@/lib/game/wildlife/simulation"

/** Live flock example within the shared building playground. */
export function SheepPenDemo({map,playbackRate,demo:provided,onMeatChange,onMilkChange}: {map:GameMap;playbackRate:number;demo?:ReturnType<typeof sheepPenDemo>;onMeatChange?:(amount:number)=>void;onMilkChange?:(amount:number)=>void}) {
  const demo = useMemo(()=>provided ?? sheepPenDemo(map),[map,provided])
  const pen=map.buildings.find(b=>b.buildType === "sheep-pen")!,centre=buildingCentre(map,pen),local=rotatedFootprint(pen,pen.rotation)
  const visitorGroup=useRef<Group>(null)
  const visitorAppearance=useMemo(()=>travelerAppearance(map.seed ?? 0,demo.visitor.id),[map.seed,demo.visitor.id])
  const population=usePopulationStore(s=>s.pack)
  const visitorSpeed=DEFAULT_WALK_SPEED*walkSpeedScale(populationVisual("peasant",visitorAppearance.variant,population).walkStride,BASE_CHARACTER_SCALE)
  const groups = useRef<Array<Group | null>>([])
  const sheep = useMemo(()=>demo.world.animals.filter(a=>a.kind === "sheep"),[demo])
  const goats = useMemo(()=>demo.world.animals.filter(a=>a.kind === "goat"),[demo])
  const accumulator = useRef(0)
  const lastMeat=useRef(-1),lastMilk=useRef(-1)
  const speed = DEFAULT_WALK_SPEED * walkSpeedScale(jobVisual("shepherd",0).walkStride,BASE_CHARACTER_SCALE)
  useFrame(({invalidate},delta)=>{
    let visitorDistance=0,visitorHeading=0
    const travel=demo.actors.map(()=>({distance:0,heading:0}))
    // Advance both simulations on the same clock; wildlife clamps individual
    // steps, so passing one enlarged delta would slow only the flock down.
    accumulator.current+=Math.min(delta,.25)*playbackRate
    while(accumulator.current>=WILDLIFE_STEP_SECONDS) {
      const dt=WILDLIFE_STEP_SECONDS
      demo.actors.forEach((actor,i)=>{
        const x=actor.x,z=actor.z
        if (!actor.herding && !actor.penCare && !seekPenCare(actor,demo.world,map,BASE_CHARACTER_SCALE,demo.stores)) seekSheep(actor,demo.world,map,BASE_CHARACTER_SCALE)
        if(actor.penCare && !stepShepherdCare(actor,demo.world,map,speed,dt,BASE_CHARACTER_SCALE,demo.stores))actor.activity="posted"
        if (actor.herding && !stepShepherd(actor,demo.world,map,speed,dt,BASE_CHARACTER_SCALE)) actor.activity="idle"
        const distance=Math.hypot(actor.x-x,actor.z-z)
        travel[i].distance+=distance
        if(distance>1e-7) travel[i].heading=Math.atan2(actor.x-x,actor.z-z)
      })
      const visitor=demo.visitor,vx=visitor.x,vz=visitor.z
      if(!visitor.penFoodVisit)seekPenFood(visitor,map,demo.stores)
      if(visitor.penFoodVisit && !stepPenFood(visitor,map,demo.stores,visitorSpeed,dt,demo.world))visitor.activity="posted"
      const moved=Math.hypot(visitor.x-vx,visitor.z-vz)
      visitorDistance+=moved
      if(moved>1e-7)visitorHeading=Math.atan2(visitor.x-vx,visitor.z-vz)
      stepWildlife(demo.world,map,dt,BASE_CHARACTER_SCALE,new Set(),[],useAnimalRigStore.getState().designs)
      accumulator.current-=dt
    }
    demo.actors.forEach((actor,i)=>{
      const group=groups.current[i]
      if(!group)return
      const {distance,heading}=travel[i],moving=distance>1e-7
      if(moving)group.rotation.y=heading
      else if(actor.penCare)group.rotation.y=actor.penCare.heading
      group.position.set(actor.x,actor.y,actor.z)
      Object.assign(group.userData,{initialized:true,phase:group.userData.phase ?? i*.3,distance,moving,activity:shepherdVisualActivity(actor),heading:group.rotation.y,playbackRate,
        meatLoad:actor.penCare?.carryingMeat ?? 0,milkLoad:actor.penCare?.carryingMilk ?? 0,milking:actor.penCare?.chore === "milkingSheep" && !actor.penCare.route.length,carrying:(actor.penCare?.carryingMeat ?? 0)+(actor.penCare?.carryingMilk ?? 0)})
    })
    if(visitorGroup.current) {
      const group=visitorGroup.current,visitor=demo.visitor
      group.position.set(visitor.x,visitor.y,visitor.z)
      if(visitorDistance>1e-7)group.rotation.y=visitorHeading
      Object.assign(group.userData,{initialized:true,phase:group.userData.phase ?? 0,distance:visitorDistance,moving:visitorDistance>1e-7,
        activity:visitor.activity,heading:group.rotation.y,playbackRate})
    }
    const meat=[...demo.stores.values()].reduce((sum,stock)=>sum+stock.meat,0)
    if(meat!==lastMeat.current) {lastMeat.current=meat;onMeatChange?.(meat)}
    const milk=[...demo.stores.values()].reduce((sum,stock)=>sum+stock.milk,0)
    if(milk!==lastMilk.current) {lastMilk.current=milk;onMilkChange?.(milk)}
    invalidate()
  },-2)
  return <group name="sheep-pen-demo" userData={{animals:demo.world.animals,actors:demo.actors}}>
    <group position={[centre.x,demo.world.animals[0].y,centre.z]} rotation={[0,buildingYaw(pen.rotation),0]}><PenFoodStock width={local.w} depth={local.d} layoutSeed={pen.layoutSeed} stock={()=>demo.stores.get(pen.id)}/></group>
    <SheepLeads animals={demo.world.animals} scale={BASE_CHARACTER_SCALE}/>
    <SheepRemains animals={demo.world.animals} scale={BASE_CHARACTER_SCALE}/>
    <WildlifeBatch kind="sheep" animals={sheep} map={map} scale={BASE_CHARACTER_SCALE} />
    <WildlifeBatch kind="goat" animals={goats} map={map} scale={BASE_CHARACTER_SCALE} />
    <PixelCharacters><group ref={visitorGroup}><TravelerFigure resident characterModel="base" appearance={visitorAppearance} map={map} characterScale={BASE_CHARACTER_SCALE} type={TRAVELER_TYPES.peasant}/></group>{demo.actors.map((actor,i)=><group key={actor.id} ref={group=>{groups.current[i]=group}}>
      <TravelerFigure resident job="shepherd" characterModel="base" map={map} characterScale={BASE_CHARACTER_SCALE} type={TRAVELER_TYPES.peasant} />
    </group>)}</PixelCharacters>
  </group>
}
