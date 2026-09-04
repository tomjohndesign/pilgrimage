"use client"

import { useLayoutEffect, useMemo, useRef } from "react"
import * as THREE from "three"

import { deriveSeed, makeRng, SEED_STREAM } from "@/lib/game/rng"
import { TERRAIN } from "@/lib/game/map/terrain"
import { tileToWorldX, tileToWorldZ, type GameMap } from "@/lib/game/map/types"
import {
  encodeObjectId,
  OUTLINE_ID_LAYER_MASK,
  treeObjectId,
} from "@/lib/game/render/outline"

/**
 * Placeholder trees: jittered boxes on every forest tile, drawn in one batch.
 * Every forest tile holds 1 or 2 trees — a seeded per-tile coin flip, so the
 * woods vary in thickness without ever thinning to scrub or clotting solid.
 * Jitter derives from the map seed (via its own stream so trees and tiles never
 * share RNG state), keeping the whole look a function of one number.
 */
const TREE_COLOR = new THREE.Color("#40542e")

export function Trees({ map }: { map: GameMap }) {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const idMeshRef = useRef<THREE.InstancedMesh>(null)

  const forestTiles = useMemo(() => {
    // Counts get their own stream so placement jitter (drawn in the effect
    // below, from the `trees` stream) stays independent of the coin flips.
    const rng = makeRng(deriveSeed(map.seed ?? 0, SEED_STREAM.treeCount))
    const tiles: Array<{ x: number; z: number; count: number }> = []
    for (let z = 0; z < map.depth; z++) {
      for (let x = 0; x < map.width; x++) {
        if (map.tiles[z * map.width + x] === "forest") {
          tiles.push({ x, z, count: 1 + (rng() < 0.5 ? 0 : 1) })
        }
      }
    }
    return tiles
  }, [map])

  const count = useMemo(
    () => forestTiles.reduce((sum, tile) => sum + tile.count, 0),
    [forestTiles],
  )

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
    const rng = makeRng(deriveSeed(map.seed ?? 0, SEED_STREAM.trees))
    const baseY = TERRAIN.forest.height

    let index = 0
    for (const tile of forestTiles) {
      // Slimmer trunks on the fuller tiles, so canopies overlap instead of
      // merging into one solid block.
      const widthScale = 1 / Math.sqrt(tile.count)
      for (let t = 0; t < tile.count; t++) {
        const height = 0.65 + rng() * 0.85
        const width = (0.34 + rng() * 0.16) * widthScale
        // Spread across the tile so a packed tile reads as many trees, not a lattice.
        const offsetX = (rng() - 0.5) * 0.8
        const offsetZ = (rng() - 0.5) * 0.8

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

        color.copy(TREE_COLOR).multiplyScalar(0.75 + rng() * 0.5)
        mesh.setColorAt(index, color)

        // One ID per tree, so overlapping trees separate from each other too.
        const [r, g, b] = encodeObjectId(treeObjectId(map.buildings.length, index))
        idColor.setRGB(r, g, b)
        idMesh.setColorAt(index, idColor)
        index++
      }
    }

    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    idMesh.instanceMatrix.needsUpdate = true
    if (idMesh.instanceColor) idMesh.instanceColor.needsUpdate = true
  }, [map, forestTiles])

  if (count === 0) return null

  return (
    <group>
      <instancedMesh
        // The instance count is a constructor argument, so remount when it changes.
        key={count}
        ref={meshRef}
        args={[
          undefined as unknown as THREE.BufferGeometry,
          undefined as unknown as THREE.Material,
          count,
        ]}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshLambertMaterial />
      </instancedMesh>

      {/* ID silhouettes for the outline pass. */}
      <instancedMesh
        key={`id-${count}`}
        ref={idMeshRef}
        args={[
          undefined as unknown as THREE.BufferGeometry,
          undefined as unknown as THREE.Material,
          count,
        ]}
        layers-mask={OUTLINE_ID_LAYER_MASK}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
    </group>
  )
}
