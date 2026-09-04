"use client"

import { useLayoutEffect, useMemo, useRef } from "react"
import * as THREE from "three"

import { makeRng } from "@/lib/game/rng"
import { TERRAIN } from "@/lib/game/map/terrain"
import { tileToWorldX, tileToWorldZ, type GameMap } from "@/lib/game/map/types"

/**
 * Placeholder trees: jittered boxes on every forest tile, drawn in one batch.
 * `density` is trees per tile — 1 reads as open woodland, 4+ as black forest.
 * Jitter derives from the map seed (XORed so trees and tiles don't share a
 * stream), keeping the whole look a function of one number.
 */
const TREE_SEED = 774411
const TREE_COLOR = new THREE.Color("#40542e")

export const DEFAULT_TREE_DENSITY = 3

export function Trees({ map, density = DEFAULT_TREE_DENSITY }: { map: GameMap; density?: number }) {
  const meshRef = useRef<THREE.InstancedMesh>(null)

  const forestTiles = useMemo(() => {
    const tiles: Array<{ x: number; z: number }> = []
    for (let z = 0; z < map.depth; z++) {
      for (let x = 0; x < map.width; x++) {
        if (map.tiles[z * map.width + x] === "forest") tiles.push({ x, z })
      }
    }
    return tiles
  }, [map])

  const count = forestTiles.length * density

  useLayoutEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return

    const matrix = new THREE.Matrix4()
    const position = new THREE.Vector3()
    const quaternion = new THREE.Quaternion()
    const euler = new THREE.Euler()
    const scale = new THREE.Vector3()
    const color = new THREE.Color()
    const rng = makeRng((map.seed ?? 0) ^ TREE_SEED)
    const baseY = TERRAIN.forest.height

    // Slimmer trunks as the packing increases, so canopies overlap instead of
    // merging into one solid block.
    const widthScale = 1 / Math.sqrt(density)

    let index = 0
    for (const tile of forestTiles) {
      for (let t = 0; t < density; t++) {
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

        color.copy(TREE_COLOR).multiplyScalar(0.75 + rng() * 0.5)
        mesh.setColorAt(index, color)
        index++
      }
    }

    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [map, forestTiles, density])

  if (count === 0) return null

  return (
    <instancedMesh
      // The instance count is a constructor argument, so remount when it changes.
      key={count}
      ref={meshRef}
      args={[
        undefined as unknown as THREE.BufferGeometry,
        undefined as unknown as THREE.Material,
        count,
      ]}
      castShadow
      receiveShadow
    >
      <boxGeometry args={[1, 1, 1]} />
      <meshLambertMaterial />
    </instancedMesh>
  )
}
