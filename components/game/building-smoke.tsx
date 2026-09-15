"use client"

import { useEffect, useMemo, useRef } from "react"
import { useFrame } from "@react-three/fiber"
import * as THREE from "three"
import { smokeGeometry, smokeMaterial, updateSmoke } from "@/lib/game/render/smoke"
import { sceneryDetail } from "@/lib/game/render/scenery-detail"
import { HearthLight } from "./hearth-lights"
import { buildingHearth } from "@/lib/game/building-art/furnishings"
import { innHearthRoofRise, singlePlaneRoofRise } from "@/lib/game/building-art/dimensions"
import { sharedChimneyMouth, type SharedChimney } from "@/lib/game/building-art/shared-chimney"

/** Smoke from the downstairs fire, with no fire or light on the sleeping floor. */
export function InnFlueSmoke({width,depth,height,flue,cutaway=false,smoke=true}: {width:number;depth:number;height:number;flue?: {x:number;z:number};cutaway?:boolean;smoke?:boolean}) {
  return flue && !cutaway && smoke ? <BuildingSmoke position={[flue.x,height+innHearthRoofRise(width,depth)+.345,flue.z]} /> : null
}

/** Reusable billboard smoke emitter, positioned at any building's chimney mouth. */
export function BuildingSmoke({ position, phase = 0 }: { position: [number, number, number]; phase?: number }) {
  const mesh = useRef<THREE.Mesh>(null)
  const geometry = useMemo(smokeGeometry, [])
  useEffect(() => () => geometry.dispose(), [geometry])
  useFrame(({ clock, invalidate, scene }) => {
    if (!mesh.current) return
    mesh.current.visible = sceneryDetail(scene) === 0
    if (!mesh.current.visible) return
    updateSmoke(geometry, clock.elapsedTime, phase)
    invalidate()
  })
  return <mesh ref={mesh} name="building-smoke" position={position} geometry={geometry} material={smokeMaterial} dispose={null} raycast={() => {}} />
}

/** Only the selected interior mounts flames and a light; smoke follows the intact shell. */
export function ShelterFire({ width, depth, height, buildType, layoutSeed, hearthZ, sharedChimney, roofRise, cutaway = false, interiorSelected = cutaway, smoke = true }: { width: number; depth: number; height: number; buildType?: string; layoutSeed?: number; hearthZ?: number; sharedChimney?: SharedChimney; roofRise?: number; cutaway?: boolean; interiorSelected?: boolean; smoke?: boolean }) {
  const root = useRef<THREE.Group>(null)
  const light=useRef<THREE.PointLight>(null), flames=useRef<THREE.Group>(null)
  const hearth=buildingHearth(buildType,width,depth,height,roofRise ?? singlePlaneRoofRise(depth),layoutSeed,hearthZ)
  const {x,z,chimneyTop,scale}=hearth
  useFrame(({clock,scene})=>{
    if (!root.current) return
    root.current.visible = sceneryDetail(scene) === 0
    if (!root.current.visible || !interiorSelected) return
    const flicker=.8+Math.sin(clock.elapsedTime*9)*.12+Math.sin(clock.elapsedTime*17)*.08
    if(light.current) light.current.intensity=.65*flicker
    if(flames.current) flames.current.scale.y=flicker
  })
  return <group ref={root} name="shelter-effects">
    {smoke && !cutaway && <BuildingSmoke position={sharedChimney ? sharedChimneyMouth(sharedChimney) : [x,chimneyTop+.025,z]} phase={width*.17+depth*.11+(sharedChimney?.side ?? 0)*.19} />}
    {interiorSelected && <group ref={flames} name="hearth-fire" position={[x,.14,z]} scale={[scale,1,scale]}>
      {[-1,0,1].map((side)=><mesh key={side} position={[side*.06,.065,0]} raycast={()=>{}}>
        <coneGeometry args={[.055,side===0?.22:.13,4]} />
        <meshBasicMaterial color={side===0?"#ffd477":"#e69746"} toneMapped={false} />
      </mesh>)}
    </group>}
    {interiorSelected && <HearthLight lightRef={light} position={[x,.28,z+.12]} />}
  </group>
}
