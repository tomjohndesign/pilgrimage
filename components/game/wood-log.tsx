"use client"

import { useEffect, useMemo } from "react"
import * as THREE from "three"
import { OUTLINE_ID_LAYER_MASK } from "@/lib/game/render/outline"
import { createWoodLogGeometry, WOOD_LOG, woodLogScale } from "@/lib/game/wood-log"

/** Shared cut-end materials for single logs and instanced camp stacks. */
export function WoodLogMaterials() {
  return <>
    <meshLambertMaterial attach="material-0" color={WOOD_LOG.bark} flatShading />
    <meshLambertMaterial attach="material-1" color={WOOD_LOG.endGrain} flatShading />
    <meshLambertMaterial attach="material-2" color={WOOD_LOG.endGrain} flatShading />
  </>
}

export function useWoodLogGeometry() {
  const geometry = useMemo(() => createWoodLogGeometry(), [])
  useEffect(() => () => geometry.dispose(), [geometry])
  return geometry
}

export function WoodLog({ idColor, characterScale }: { idColor: THREE.Color; characterScale: number }) {
  const geometry = useWoodLogGeometry()
  return <group scale={woodLogScale(characterScale)}>
    <mesh geometry={geometry}><WoodLogMaterials /></mesh>
    <mesh geometry={geometry} layers-mask={OUTLINE_ID_LAYER_MASK}>
      <meshBasicMaterial color={idColor} toneMapped={false} />
    </mesh>
  </group>
}
