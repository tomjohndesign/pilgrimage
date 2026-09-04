"use client"

import { useLayoutEffect, useMemo, useRef } from "react"
import * as THREE from "three"

import { makeRng } from "@/lib/game/rng"
import { TERRAIN } from "@/lib/game/map/terrain"
import { tileToWorldX, tileToWorldZ, type GameMap } from "@/lib/game/map/types"

/**
 * Tiles are drawn slightly smaller than 1 unit so the gaps between them read as
 * grid lines against the darker slab underneath.
 */
const TILE_INSET = 0.94

/** Top of the base slab. Must sit below the shortest terrain height. */
export const SLAB_TOP = 0.08

const SLAB_THICKNESS = 1.2
const SLAB_COLOR = "#241a10"

/**
 * Deterministic, so the map looks identical on every load and in screenshots.
 * XORed with the map seed so the colour grain also changes per map.
 */
const TILE_JITTER_SEED = 20250805

export function TerrainTiles({ map }: { map: GameMap }) {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const count = map.width * map.depth

  useLayoutEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return

    const matrix = new THREE.Matrix4()
    const position = new THREE.Vector3()
    const quaternion = new THREE.Quaternion()
    const scale = new THREE.Vector3()
    const color = new THREE.Color()
    const rng = makeRng((map.seed ?? 0) ^ TILE_JITTER_SEED)

    for (let z = 0; z < map.depth; z++) {
      for (let x = 0; x < map.width; x++) {
        const index = z * map.width + x
        const def = TERRAIN[map.tiles[index]]

        // Box base sits at y=0 and the top at the terrain height, so tiles sink
        // into the slab and never show a gap from a low camera angle.
        position.set(tileToWorldX(map, x), def.height / 2, tileToWorldZ(map, z))
        scale.set(TILE_INSET, def.height, TILE_INSET)
        matrix.compose(position, quaternion, scale)
        mesh.setMatrixAt(index, matrix)

        color.set(def.color)
        color.multiplyScalar(1 + (rng() - 0.5) * def.jitter)
        mesh.setColorAt(index, color)
      }
    }

    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [map])

  const slabPosition = useMemo<[number, number, number]>(
    () => [0, SLAB_TOP - SLAB_THICKNESS / 2, 0],
    [],
  )

  return (
    <group>
      <mesh position={slabPosition} receiveShadow>
        <boxGeometry args={[map.width, SLAB_THICKNESS, map.depth]} />
        <meshLambertMaterial color={SLAB_COLOR} />
      </mesh>

      <instancedMesh
        ref={meshRef}
        args={[undefined as unknown as THREE.BufferGeometry, undefined as unknown as THREE.Material, count]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshLambertMaterial />
      </instancedMesh>
    </group>
  )
}
