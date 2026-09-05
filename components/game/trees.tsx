"use client"

import { useLayoutEffect, useMemo, useRef } from "react"
import * as THREE from "three"

import { deriveSeed, makeRng, SEED_STREAM } from "@/lib/game/rng"
import { computeForestShade } from "@/lib/game/map/forest-field"
import { TILE_HEIGHT } from "@/lib/game/map/terrain"
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
 * The stand fades at its edges: the coin flip only lands on 2 deep in the
 * woods, and height and colour follow the forest-shade field, so the
 * outermost trees are sparser, shorter, and lighter and the woods taper into
 * grassland instead of stopping at a wall. Every forest tile keeps at least
 * one tree — forest is impassable, and a treeless tile would lie about that.
 * Jitter derives from the map seed (via its own stream so trees and tiles
 * never share RNG state), keeping the whole look a function of one number.
 */
const TREE_COLOR = new THREE.Color("#40542e")

/** Edge trees scale down to this fraction of a core tree's size. */
const EDGE_SIZE_SCALE = 0.55

/** Chance of a second tree at the very heart of the woods; fades to 0 at the rim. */
const SECOND_TREE_CHANCE = 0.5

interface TreePlacement {
  x: number
  z: number
  offsetX: number
  offsetZ: number
  height: number
  width: number
  rotation: number
  brightness: number
}

export function Trees({ map }: { map: GameMap }) {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const idMeshRef = useRef<THREE.InstancedMesh>(null)

  // The plan is pure data derived from the map seed, built up front because the
  // instance count must be known before the meshes mount.
  const placements = useMemo<TreePlacement[]>(() => {
    const shade = computeForestShade(map)
    // Counts get their own stream so placement jitter (from the `trees`
    // stream) stays independent of the coin flips.
    const rngCount = makeRng(deriveSeed(map.seed ?? 0, SEED_STREAM.treeCount))
    const rng = makeRng(deriveSeed(map.seed ?? 0, SEED_STREAM.trees))
    const trees: TreePlacement[] = []

    for (let z = 0; z < map.depth; z++) {
      for (let x = 0; x < map.width; x++) {
        const index = z * map.width + x
        if (map.tiles[index] !== "forest") continue
        const depth = shade[index]

        const count = 1 + (rngCount() < SECOND_TREE_CHANCE * depth ? 1 : 0)
        // Slimmer trunks on the fuller tiles, so canopies overlap instead of
        // merging into one solid block.
        const widthScale = 1 / Math.sqrt(count)
        const sizeScale = EDGE_SIZE_SCALE + (1 - EDGE_SIZE_SCALE) * depth

        for (let t = 0; t < count; t++) {
          trees.push({
            x,
            z,
            height: (0.65 + rng() * 0.85) * sizeScale,
            width: (0.34 + rng() * 0.16) * widthScale * sizeScale,
            // Spread across the tile so a packed tile reads as many trees, not a lattice.
            offsetX: (rng() - 0.5) * 0.8,
            offsetZ: (rng() - 0.5) * 0.8,
            rotation: rng() * Math.PI,
            // Edge growth reads younger and sunlit — a touch lighter than the core.
            brightness: (0.75 + rng() * 0.5) * (1.12 - 0.18 * depth),
          })
        }
      }
    }
    return trees
  }, [map])

  const count = placements.length

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
    const baseY = TILE_HEIGHT

    for (let index = 0; index < placements.length; index++) {
      const tree = placements[index]
      position.set(
        tileToWorldX(map, tree.x) + tree.offsetX,
        baseY + tree.height / 2,
        tileToWorldZ(map, tree.z) + tree.offsetZ,
      )
      euler.set(0, tree.rotation, 0)
      quaternion.setFromEuler(euler)
      scale.set(tree.width, tree.height, tree.width)
      matrix.compose(position, quaternion, scale)
      mesh.setMatrixAt(index, matrix)
      idMesh.setMatrixAt(index, matrix)

      color.copy(TREE_COLOR).multiplyScalar(tree.brightness)
      mesh.setColorAt(index, color)

      // One ID per tree, so overlapping trees separate from each other too.
      const [r, g, b] = encodeObjectId(treeObjectId(map.buildings.length, index))
      idColor.setRGB(r, g, b)
      idMesh.setColorAt(index, idColor)
    }

    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    idMesh.instanceMatrix.needsUpdate = true
    if (idMesh.instanceColor) idMesh.instanceColor.needsUpdate = true
  }, [map, placements])

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
