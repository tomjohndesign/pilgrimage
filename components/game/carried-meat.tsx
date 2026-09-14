"use client"

import { useRef } from "react"
import { useFrame } from "@react-three/fiber"
import type { Group } from "three"
import { MeatTray, MilkBucket } from "./food-props"

/** Compact loads share the character's existing carrying and kneeling poses. */
export function ShepherdLoad({scale}:{scale:number}) {
  const root=useRef<Group>(null),meat=useRef<Group>(null),milk=useRef<Group>(null)
  useFrame(()=>{
    const data=root.current?.parent?.userData
    if(!root.current || !meat.current || !milk.current)return
    meat.current.visible=(data?.meatLoad ?? 0)>0
    milk.current.visible=(data?.milkLoad ?? 0)>0 || data?.milking===true
    milk.current.position.set(data?.milking ? .07 : 0,data?.milking ? .045 : .18,data?.milking ? .14 : .105)
  })
  return <group ref={root} scale={scale} name="shepherd-food-load">
    <group ref={meat} visible={false} position={[0,.235,.105]}><MeatTray/></group>
    <group ref={milk} visible={false}><MilkBucket/></group>
  </group>
}
