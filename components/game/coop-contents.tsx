"use client"

import { useRef } from "react"
import { useFrame } from "@react-three/fiber"
import type { Group } from "three"
import { buildingCentre } from "@/lib/game/buildings"
import { buildingYaw, rotateBuildingPoint, rotatedFootprint } from "@/lib/game/building-rotation"
import { layoutHand } from "@/lib/game/building-layout"
import { coopLayout } from "@/lib/game/coop-layout"
import type { BuildingDef, GameMap } from "@/lib/game/map/types"
import { groundHeight } from "@/lib/game/map/elevation"
import type { FoodStock } from "@/lib/game/storage"
import type { SimTraveler } from "@/lib/game/sim"
import type { WildlifeWorld } from "@/lib/game/wildlife/simulation"

export function EggBasket() {
  return <group name="egg-basket">
    <mesh><cylinderGeometry args={[.078,.055,.06,8,1,true]}/><meshLambertMaterial color="#9b7c50" side={2}/></mesh>
    <mesh position={[0,-.026,0]}><cylinderGeometry args={[.055,.055,.01,8]}/><meshLambertMaterial color="#80633f"/></mesh>
    {[-1,0,1].map(i=><mesh key={i} position={[i*.033,.015,(i%2)*.017]} scale={[.017,.024,.017]}><sphereGeometry args={[1,7,5]}/><meshLambertMaterial color="#e4d8b7"/></mesh>)}
  </group>
}

/** Live nest eggs and the keeper's hand basket use the same inventory in game and preview. */
export function CoopContents({map,coop,world,stores,actor,scale}:{map:GameMap;coop:BuildingDef;world:()=>WildlifeWorld|undefined|null;stores:()=>ReadonlyMap<string,FoodStock>;actor:(id:number)=>SimTraveler|undefined;scale:number}) {
  const eggs=useRef<Array<Group|null>>([]),basket=useRef<Group>(null)
  const centre=buildingCentre(map,coop),{w,d}=rotatedFootprint(coop,coop.rotation),layout=coopLayout(w,d)
  const hand=layoutHand(coop.buildType,coop.layoutSeed),baseY=groundHeight(map,coop.x+(coop.w-1)/2,coop.z+(coop.d-1)/2)
  useFrame(()=>{
    const keeperId=world()?.coopKeepers?.get(coop.id),keeper=keeperId===undefined ? undefined : actor(keeperId)
    const carrying=keeper?.coopEggs?.amount ?? 0,count=Math.max(0,(stores().get(coop.id)?.eggs ?? 0)-carrying)
    eggs.current.forEach((egg,i)=>{if(egg)egg.visible=i<count})
    if(!basket.current)return
    basket.current.visible=carrying>0 && !!keeper
    if(keeper && carrying) {
      const heading=keeper.coopEggs!.heading,forward=.105*scale
      const at=rotateBuildingPoint(keeper.x+Math.sin(heading)*forward-centre.x,keeper.z+Math.cos(heading)*forward-centre.z,-(coop.rotation ?? 0))
      basket.current.position.set(at.x,keeper.y-baseY+.235*scale,at.z)
      basket.current.rotation.y=heading-buildingYaw(coop.rotation)
    }
  })
  return <group name="coop-contents">
    {Array.from({length:12},(_,i)=>{
      const nest=layout.nests[i%2],slot=Math.floor(i/2)
      return <group key={i} ref={g=>{eggs.current[i]=g}} visible={false} position={[(nest.x+(slot%3-1)*.055)*hand,layout.floorHeight+.132,nest.z+(Math.floor(slot/3)-.5)*.07]}>
        <mesh scale={[.023,.031,.023]}><sphereGeometry args={[1,7,5]}/><meshLambertMaterial color="#e9dbb9"/></mesh>
      </group>
    })}
    <group ref={basket} visible={false} scale={scale}><EggBasket/></group>
  </group>
}
