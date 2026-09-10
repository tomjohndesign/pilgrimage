"use client"

import { useContext, useLayoutEffect, useMemo, useRef } from "react"
import * as THREE from "three"
import { fordStones } from "@/lib/game/render/ford-stones"
import { OUTLINE_ID_LAYER_MASK } from "@/lib/game/render/outline"
import type { TerrainBlockBounds } from "@/lib/game/render/terrain-blocks"
import { TerrainMapContext } from "./terrain-map-context"

/** Exposed stones share terrain blocks, lighting and outline depth with the bank. */
export function FordStones({ bounds, revision }: { bounds: TerrainBlockBounds; revision: object }) {
  const map = useContext(TerrainMapContext)!
  const stones = useMemo(() => fordStones(map, bounds), [revision, bounds])
  return stones.length ? <group name="ford-stones">
    <StoneBatch stones={stones} />
    <StoneBatch stones={stones} silhouette />
  </group> : null
}

function StoneBatch({ stones, silhouette = false }: { stones: ReturnType<typeof fordStones>; silhouette?: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  useLayoutEffect(() => {
    const mesh = ref.current!
    const transform = new THREE.Object3D(), color = new THREE.Color()
    stones.forEach((stone, i) => {
      transform.position.set(stone.x, stone.y, stone.z)
      transform.scale.set(stone.sx, stone.sy, stone.sz)
      transform.rotation.set(0, stone.yaw, 0)
      transform.updateMatrix()
      mesh.setMatrixAt(i, transform.matrix)
      if (!silhouette) mesh.setColorAt(i, color.set(stone.color))
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [stones, silhouette])
  return <instancedMesh ref={ref} name={silhouette ? "ford-stone-depth" : "ford-stone-crowns"}
    args={[undefined as unknown as THREE.BufferGeometry, undefined as unknown as THREE.Material, stones.length]}
    {...(silhouette ? { "layers-mask": OUTLINE_ID_LAYER_MASK } : {})}>
    <dodecahedronGeometry args={[1, 0]} />
    {silhouette ? <meshBasicMaterial color="black" toneMapped={false} /> : <meshLambertMaterial flatShading />}
  </instancedMesh>
}
