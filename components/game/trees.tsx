"use client"

import { useLayoutEffect, useMemo, useRef } from "react"
import * as THREE from "three"

import { useCameraStore } from "@/lib/game/camera-store"
import { deriveSeed, makeRng, SEED_STREAM } from "@/lib/game/rng"
import { TERRAIN } from "@/lib/game/map/terrain"
import { tileToWorldX, tileToWorldZ, type GameMap } from "@/lib/game/map/types"
import {
  encodeObjectId,
  OUTLINE_ID_LAYER_MASK,
  treeObjectId,
} from "@/lib/game/render/outline"

/** Placeholder trees: one jittered box per forest tile, drawn in a single batch. */
const TREE_COLOR = new THREE.Color("#40542e")

export function Trees({ map }: { map: GameMap }) {
  // Tree shapes and placement re-roll whenever the world seed changes.
  const seed = useCameraStore((s) => s.seed)
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const idMeshRef = useRef<THREE.InstancedMesh>(null)

  const forestTiles = useMemo(() => {
    const tiles: Array<{ x: number; z: number }> = []
    for (let z = 0; z < map.depth; z++) {
      for (let x = 0; x < map.width; x++) {
        if (map.tiles[z * map.width + x] === "forest") tiles.push({ x, z })
      }
    }
    return tiles
  }, [map])

  useLayoutEffect(() => {
    const mesh = meshRef.current
    const idMesh = idMeshRef.current
    if (!mesh || !idMesh) return

    const matrix = new THREE.Matrix4()
    const position = new THREE.Vector3()
    const quaternion = new THREE.Quaternion()
    const euler = new THREE.Euler()
    const scale = new THREE.Vector3()
    const color = new THREE.Color()
    const idColor = new THREE.Color()
    const rng = makeRng(deriveSeed(seed, SEED_STREAM.trees))
    const baseY = TERRAIN.forest.height

    forestTiles.forEach((tile, index) => {
      const height = 0.7 + rng() * 0.7
      const width = 0.34 + rng() * 0.16
      // Nudge off-centre so the canopy doesn't look like a regular lattice.
      const offsetX = (rng() - 0.5) * 0.34
      const offsetZ = (rng() - 0.5) * 0.34

      position.set(
        tileToWorldX(map, tile.x) + offsetX,
        baseY + height / 2,
        tileToWorldZ(map, tile.z) + offsetZ,
      )
      euler.set(0, rng() * Math.PI, 0)
      quaternion.setFromEuler(euler)
      scale.set(width, height, width)
      matrix.compose(position, quaternion, scale)
      mesh.setMatrixAt(index, matrix)
      idMesh.setMatrixAt(index, matrix)

      color.copy(TREE_COLOR).multiplyScalar(0.8 + rng() * 0.45)
      mesh.setColorAt(index, color)

      // One ID per tree, so overlapping trees separate from each other too.
      const [r, g, b] = encodeObjectId(treeObjectId(map.buildings.length, index))
      idColor.setRGB(r, g, b)
      idMesh.setColorAt(index, idColor)
    })

    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    idMesh.instanceMatrix.needsUpdate = true
    if (idMesh.instanceColor) idMesh.instanceColor.needsUpdate = true
  }, [map, forestTiles, seed])

  if (forestTiles.length === 0) return null

  return (
    <group>
      <instancedMesh
        ref={meshRef}
        args={[
          undefined as unknown as THREE.BufferGeometry,
          undefined as unknown as THREE.Material,
          forestTiles.length,
        ]}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshLambertMaterial />
      </instancedMesh>

      {/* ID silhouettes for the outline pass. */}
      <instancedMesh
        ref={idMeshRef}
        args={[
          undefined as unknown as THREE.BufferGeometry,
          undefined as unknown as THREE.Material,
          forestTiles.length,
        ]}
        layers-mask={OUTLINE_ID_LAYER_MASK}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
    </group>
  )
}
