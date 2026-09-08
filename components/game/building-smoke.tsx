"use client"

import { useEffect, useMemo, useRef } from "react"
import { useFrame } from "@react-three/fiber"
import * as THREE from "three"
import { sceneryDetail } from "@/lib/game/render/scenery-detail"
import { HearthLight } from "./hearth-lights"
import { CHARACTER_PIXEL_SIZE } from "@/lib/game/render/pixel-scale"
import { shelterHearth } from "@/lib/game/building-art/furnishings"
import { singlePlaneRoofRise } from "@/lib/game/building-art/dimensions"

/** Reusable billboard smoke emitter, positioned at any building's chimney mouth. */
export function BuildingSmoke({ position, phase = 0 }: { position: [number, number, number]; phase?: number }) {
  const group = useRef<THREE.Group>(null)
  const texture = useMemo(() => {
    const size=24, data=new Uint8Array(size*size*4)
    for(let y=0;y<size;y++) for(let x=0;x<size;x++) {
      const inside=Math.hypot(x-10,y-12)<8 || Math.hypot(x-15,y-9)<6 || Math.hypot(x-7,y-8)<5
      const i=(y*size+x)*4
      data[i]=data[i+1]=data[i+2]=255
      data[i+3]=inside ? 210 : 0
    }
    const map=new THREE.DataTexture(data,size,size)
    map.magFilter=map.minFilter=THREE.NearestFilter
    map.needsUpdate=true
    return map
  },[])
  useEffect(()=>()=>texture.dispose(),[texture])
  useFrame(({clock,invalidate,scene})=>{
    if (!group.current) return
    group.current.visible = sceneryDetail(scene) === 0
    if (!group.current.visible) return
    group.current?.children.forEach((object,i)=>{
      const sprite=object as THREE.Sprite
      const t=(clock.elapsedTime*.23+i/5+phase)%1
      // Fixed sprite size preserves the character's apparent pixel size as puffs rise.
      sprite.position.set(Math.round((t*.33+Math.sin(t*6+i)*.055)/CHARACTER_PIXEL_SIZE)*CHARACTER_PIXEL_SIZE,t*1.35,0)
      ;(sprite.material as THREE.SpriteMaterial).opacity=Math.sin(Math.PI*t)*.32
    })
    invalidate()
  })
  return <group ref={group} name="building-smoke" position={position}>
    {Array.from({length:5},(_,i)=><sprite key={i} scale={24*CHARACTER_PIXEL_SIZE} raycast={()=>{}}>
      <spriteMaterial map={texture} color="#b9b7ab" transparent depthWrite={false} toneMapped={false} />
    </sprite>)}
  </group>
}

/** Hearth light stays visible in cutaway; chimney smoke follows the intact shell. */
export function ShelterFire({ width, depth, height, buildType, cutaway = false }: { width: number; depth: number; height: number; buildType?: string; cutaway?: boolean }) {
  const root = useRef<THREE.Group>(null)
  const light=useRef<THREE.PointLight>(null), flames=useRef<THREE.Group>(null)
  const {x,z,chimneyTop,scale}=shelterHearth(width,depth,height,singlePlaneRoofRise(depth))
  useFrame(({clock,scene})=>{
    if (!root.current) return
    root.current.visible = sceneryDetail(scene) === 0
    if (!root.current.visible) return
    const flicker=.8+Math.sin(clock.elapsedTime*9)*.12+Math.sin(clock.elapsedTime*17)*.08
    if(light.current) light.current.intensity=.65*flicker
    if(flames.current) flames.current.scale.y=flicker
  })
  return <group ref={root} name="shelter-effects">
    {!cutaway && <BuildingSmoke position={[x,chimneyTop+.025,z]} phase={width*.17+depth*.11} />}
    <group ref={flames} name="hearth-fire" position={[x,.14,z]} scale={[scale,1,scale]}>
      {[-1,0,1].map((side)=><mesh key={side} position={[side*.06,.065,0]} raycast={()=>{}}>
        <coneGeometry args={[.055,side===0?.22:.13,4]} />
        <meshBasicMaterial color={side===0?"#ffd477":"#e69746"} toneMapped={false} />
      </mesh>)}
    </group>
    <HearthLight lightRef={light} position={[x,.28,z+.12]} />
  </group>
}
