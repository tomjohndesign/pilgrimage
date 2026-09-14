"use client"

import { useRef } from "react"
import { useFrame } from "@react-three/fiber"
import type { Group } from "three"
import { sheepPenLayout } from "@/lib/game/workshop-layout"
import { layoutHand } from "@/lib/game/building-layout"
import type { FoodStock } from "@/lib/game/storage"
import { MeatTray, MilkBucket } from "./food-props"

/** Each delivered load fills the public platform, just as logs fill a wood bay. */
export function PenFoodStock({width,depth,layoutSeed,stock}:{width:number;depth:number;layoutSeed?:number;stock:()=>FoodStock|undefined}) {
  const meat=useRef<Array<Group|null>>([]),milk=useRef<Array<Group|null>>([])
  const layout=sheepPenLayout(width,depth)
  useFrame(()=>{
    const food=stock()
    meat.current.forEach((g,i)=>{if(g)g.visible=(food?.meat ?? 0)>i*25})
    milk.current.forEach((g,i)=>{if(g)g.visible=(food?.milk ?? 0)>i*12})
  })
  return <group name="pen-food-stock" position={[layout.storageX*layoutHand("sheep-pen",layoutSeed),.19,layout.storageZ]}>
    {Array.from({length:6},(_,i)=><group key={`meat-${i}`} ref={g=>{meat.current[i]=g}} visible={false} position={[-.19+(i%2)*.2,.037+Math.floor(i/4)*.075,-.6+Math.floor(i/2)%2*.22]} scale={1.3}><MeatTray/></group>)}
    {Array.from({length:6},(_,i)=><group key={`milk-${i}`} ref={g=>{milk.current[i]=g}} visible={false} position={[-.26+(i%3)*.25,.06,.58-Math.floor(i/3)*.23]} scale={1.2}><MilkBucket/></group>)}
  </group>
}
