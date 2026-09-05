"use client"

import { useEffect, useLayoutEffect, useMemo } from "react"
import * as THREE from "three"

import { deriveSeed, makeRng, SEED_STREAM } from "@/lib/game/rng"
import { computeDarkShade, computeForestShade } from "@/lib/game/map/forest-field"
import { isWoods, TILE_HEIGHT } from "@/lib/game/map/terrain"
import { tileAt, tileToWorldX, tileToWorldZ, type GameMap } from "@/lib/game/map/types"
import {
  encodeObjectId,
  OUTLINE_ID_LAYER_MASK,
  RELIC_OBJECT_ID,
  treeObjectId,
} from "@/lib/game/render/outline"
import {
  generateTree,
  pickSpecies,
  TREE_SPECIES_ORDER,
  type TreeShape,
  type TreeSpeciesDef,
  type TreeSpeciesId,
} from "@/lib/game/trees/species"
import { useTreeTuningStore } from "@/lib/game/trees/tree-tuning-store"

/**
 * Parametric species trees, drawn as instanced low-poly primitives.
 *
 * Two layers:
 *  - `Trees` reads a map, decides where trees stand and which species each is
 *    (weighted by habitat — birch and hawthorn favour the forest edge, beech
 *    the interior — and by each species' grove field, so kinds clump together),
 *    and hands the placements on. Every forest tile holds 1 or 2 trees — a
 *    seeded coin flip that only lands on 2 deep in the woods — and the stand
 *    fades at its rim: the outermost trees are a little shorter and lighter,
 *    following the forest-shade field the ground colour also reads, so the
 *    woods taper into grassland instead of stopping at a wall. Dark forest is
 *    the one exception to the 1–2 rule: old growth holds 2 or 3 trees, taller
 *    and darker, and the dark-shade field feathers that into the woods around
 *    it so the heart of a forest never has a hard rim.
 *  - `TreeField` grows each placement into a `TreeShape` and renders them. The
 *    lab on /assets/textures uses it directly to line up trees of one species.
 *
 * Cost model, since the forest can be many thousand trees: each species owns a
 * trunk geometry and a crown geometry, both tiny (a 6-sided cylinder, an
 * 80-face icosphere or a 7-sided cone), and every tree is a few instances of
 * those. That is 2 draw calls per species for colour plus 2 for the outline ID
 * pass, so ~24 draw calls for the whole forest however big the map. No
 * per-tree geometry, no textures, no transparency.
 */

export interface TreePlacement {
  /** World position of the tree's base. */
  x: number
  y: number
  z: number
  species: TreeSpeciesId
  /** Whole-tree size multiplier; edge trees are smaller. Defaults to 1. */
  scale?: number
  /** Brightness multiplier on bark and foliage; edge trees are lighter. Defaults to 1. */
  brightness?: number
}

/** Edge trees scale down to this fraction of a core tree's size. */
const EDGE_SIZE_SCALE = 0.7

/** Chance of a second tree at the very heart of the woods; fades to 0 at the rim. */
const SECOND_TREE_CHANCE = 0.5

/** Old growth stands this much taller than the woods around it, at full dark shade. */
const DARK_HEIGHT_SCALE = 1.45
/** And this much darker. */
const DARK_BRIGHTNESS = 0.6

/** Trunks sink slightly into the ground so a lean never exposes a gap. */
const TRUNK_SINK = 0.04

/** Faces of the geometries. Low on purpose; flat shading does the rest. */
const TRUNK_SEGMENTS = 6
const BLOB_DETAIL = 1
const CONE_SEGMENTS = 7

function makeTrunkGeometry(taper: number): THREE.BufferGeometry {
  // Unit height with the base on the origin, so scale.y is the trunk height.
  const geometry = new THREE.CylinderGeometry(taper, 1, 1, TRUNK_SEGMENTS)
  geometry.translate(0, 0.5, 0)
  return geometry
}

function makeCrownGeometry(shape: TreeSpeciesDef["crown"]["shape"]): THREE.BufferGeometry {
  // Both span ±1 on every axis, so scale is the half-extent in world units.
  return shape === "cone"
    ? new THREE.ConeGeometry(1, 2, CONE_SEGMENTS)
    : new THREE.IcosahedronGeometry(1, BLOB_DETAIL)
}

/** Woods tiles that touch open ground; the map edge does not count. */
function isForestEdge(map: GameMap, x: number, z: number): boolean {
  for (const [dx, dz] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]) {
    const neighbour = tileAt(map, x + dx, z + dz)
    if (neighbour !== null && !isWoods(neighbour)) return true
  }
  return false
}

export function Trees({ map }: { map: GameMap }) {
  const species = useTreeTuningStore((s) => s.species)

  const placements = useMemo<TreePlacement[]>(() => {
    const seed = map.seed ?? 0
    const shade = computeForestShade(map)
    const darkShade = computeDarkShade(map)
    // Counts get their own stream so species and jitter (from the `trees`
    // stream) stay independent of the coin flips.
    const rngCount = makeRng(deriveSeed(seed, SEED_STREAM.treeCount))
    const rng = makeRng(deriveSeed(seed, SEED_STREAM.trees))
    // Spread across the tile so a packed tile reads as many trees, not a lattice.
    const scatter = 0.8
    const out: TreePlacement[] = []
    for (let z = 0; z < map.depth; z++) {
      for (let x = 0; x < map.width; x++) {
        const index = z * map.width + x
        if (!isWoods(map.tiles[index])) continue
        const depth = shade[index]
        const dark = darkShade[index]
        const oldGrowth = map.tiles[index] === "darkwood"
        // One coin flip per woods tile, dark or not, so ordinary forest draws
        // exactly what it did before dark forest existed.
        const flip = rngCount()
        const count = oldGrowth
          ? 2 + (flip < SECOND_TREE_CHANCE * dark ? 1 : 0)
          : 1 + (flip < SECOND_TREE_CHANCE * depth ? 1 : 0)
        const site = { x, z, onEdge: isForestEdge(map, x, z), seed }
        for (let t = 0; t < count; t++) {
          const id = pickSpecies(species, site, rng)
          out.push({
            x: tileToWorldX(map, x) + (rng() - 0.5) * scatter,
            y: TILE_HEIGHT,
            z: tileToWorldZ(map, z) + (rng() - 0.5) * scatter,
            species: id,
            scale:
              (EDGE_SIZE_SCALE + (1 - EDGE_SIZE_SCALE) * depth) *
              (1 + (DARK_HEIGHT_SCALE - 1) * dark),
            // Edge growth reads younger and sunlit — a touch lighter than the
            // core; old growth darker still, feathered by the dark shade.
            brightness: (1.1 - 0.15 * depth) * (1 - (1 - DARK_BRIGHTNESS) * dark),
          })
        }
      }
    }
    return out
  }, [map, species])

  return (
    <TreeField
      placements={placements}
      seed={deriveSeed(map.seed ?? 0, SEED_STREAM.treeShapes)}
      idBase={map.buildings.length}
    />
  )
}

interface GrownTree {
  placement: TreePlacement
  shape: TreeShape
  objectId: number
}

/**
 * Grow and draw a list of placements. `seed` drives the individual shapes;
 * `idBase` is how many outline IDs are already taken (by buildings).
 */
export function TreeField({
  placements,
  seed,
  idBase = 0,
}: {
  placements: TreePlacement[]
  seed: number
  idBase?: number
}) {
  const species = useTreeTuningStore((s) => s.species)
  const variance = useTreeTuningStore((s) => s.variance)

  const batches = useMemo(() => {
    const rng = makeRng(seed)
    const grouped = new Map<TreeSpeciesId, GrownTree[]>()
    // Trees take the ID block between the buildings and the relic. On huge maps
    // IDs wrap rather than overflow: two trees sharing an ID only lose the
    // outline between themselves, and they are far apart.
    const idSpan = RELIC_OBJECT_ID - 1 - idBase
    placements.forEach((placement, index) => {
      const shape = generateTree(species[placement.species], rng, variance)
      const objectId = treeObjectId(idBase, index % idSpan)
      let list = grouped.get(placement.species)
      if (!list) grouped.set(placement.species, (list = []))
      list.push({ placement, shape, objectId })
    })
    return TREE_SPECIES_ORDER.filter((id) => grouped.has(id)).map((id) => ({
      def: species[id],
      trees: grouped.get(id)!,
    }))
  }, [placements, seed, idBase, species, variance])

  return (
    <group>
      {batches.map(({ def, trees }) => (
        <SpeciesBatch key={def.id} def={def} trees={trees} />
      ))}
    </group>
  )
}

/** Every tree of one species: trunks in one instanced mesh, crowns in another. */
function SpeciesBatch({ def, trees }: { def: TreeSpeciesDef; trees: GrownTree[] }) {
  const trunkGeometry = useMemo(() => makeTrunkGeometry(def.trunk.taper), [def.trunk.taper])
  const crownGeometry = useMemo(() => makeCrownGeometry(def.crown.shape), [def.crown.shape])
  useEffect(() => () => trunkGeometry.dispose(), [trunkGeometry])
  useEffect(() => () => crownGeometry.dispose(), [crownGeometry])

  const trunkCount = trees.length
  const crownCount = useMemo(
    () => trees.reduce((sum, tree) => sum + tree.shape.crown.length, 0),
    [trees],
  )

  // Meshes are created by the instanced mesh elements; instance counts are
  // constructor arguments, so the elements remount (via key) when counts change
  // and the effect below refills them.
  const refs = useMemo(
    () => ({
      trunk: { current: null as THREE.InstancedMesh | null },
      crown: { current: null as THREE.InstancedMesh | null },
      trunkId: { current: null as THREE.InstancedMesh | null },
      crownId: { current: null as THREE.InstancedMesh | null },
    }),
    [],
  )

  useLayoutEffect(() => {
    const trunk = refs.trunk.current
    const crown = refs.crown.current
    const trunkId = refs.trunkId.current
    const crownId = refs.crownId.current
    if (!trunk || !crown || !trunkId || !crownId) return

    const matrix = new THREE.Matrix4()
    const position = new THREE.Vector3()
    const quaternion = new THREE.Quaternion()
    const axis = new THREE.Vector3()
    const scale = new THREE.Vector3()
    const color = new THREE.Color()
    const idColor = new THREE.Color()
    const trunkBase = new THREE.Color(def.trunk.color)
    const crownBase = new THREE.Color(def.crown.color)

    let crownIndex = 0
    trees.forEach(({ placement, shape, objectId }, trunkIndex) => {
      const s = placement.scale ?? 1
      const light = placement.brightness ?? 1
      const [r, g, b] = encodeObjectId(objectId)
      idColor.setRGB(r, g, b)

      // Trunk: tilt about a horizontal axis so the tip leans toward leanYaw.
      axis.set(Math.sin(shape.leanYaw), 0, -Math.cos(shape.leanYaw))
      quaternion.setFromAxisAngle(axis, shape.leanAngle)
      position.set(placement.x, placement.y - TRUNK_SINK, placement.z)
      scale.set(shape.trunkRadius * s, shape.trunkHeight * s + TRUNK_SINK, shape.trunkRadius * s)
      matrix.compose(position, quaternion, scale)
      trunk.setMatrixAt(trunkIndex, matrix)
      trunkId.setMatrixAt(trunkIndex, matrix)
      trunk.setColorAt(trunkIndex, color.copy(trunkBase).multiplyScalar(shape.trunkShade * light))
      trunkId.setColorAt(trunkIndex, idColor)

      color.copy(crownBase).multiplyScalar(shape.crownShade * light)
      for (const part of shape.crown) {
        position.set(
          placement.x + part.x * s,
          placement.y + part.y * s,
          placement.z + part.z * s,
        )
        quaternion.setFromAxisAngle(axis.set(0, 1, 0), part.yaw)
        scale.set(part.rx * s, part.ry * s, part.rz * s)
        matrix.compose(position, quaternion, scale)
        crown.setMatrixAt(crownIndex, matrix)
        crownId.setMatrixAt(crownIndex, matrix)
        crown.setColorAt(crownIndex, color)
        crownId.setColorAt(crownIndex, idColor)
        crownIndex++
      }
    })

    for (const mesh of [trunk, crown, trunkId, crownId]) {
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
      // Frustum culling tests the instanced bounds, so refresh them.
      mesh.computeBoundingSphere()
    }
  }, [def, trees, refs, trunkCount, crownCount])

  if (trunkCount === 0) return null

  const instancedArgs = (count: number) =>
    [
      undefined as unknown as THREE.BufferGeometry,
      undefined as unknown as THREE.Material,
      count,
    ] as const

  return (
    <group>
      <instancedMesh key={`trunk-${trunkCount}`} ref={refs.trunk} args={instancedArgs(trunkCount)}>
        <primitive object={trunkGeometry} attach="geometry" />
        <meshLambertMaterial flatShading />
      </instancedMesh>
      <instancedMesh key={`crown-${crownCount}`} ref={refs.crown} args={instancedArgs(crownCount)}>
        <primitive object={crownGeometry} attach="geometry" />
        <meshLambertMaterial flatShading />
      </instancedMesh>

      {/* ID silhouettes for the outline pass; trunk and crown share the tree's ID. */}
      <instancedMesh
        key={`trunk-id-${trunkCount}`}
        ref={refs.trunkId}
        args={instancedArgs(trunkCount)}
        layers-mask={OUTLINE_ID_LAYER_MASK}
      >
        <primitive object={trunkGeometry} attach="geometry" />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <instancedMesh
        key={`crown-id-${crownCount}`}
        ref={refs.crownId}
        args={instancedArgs(crownCount)}
        layers-mask={OUTLINE_ID_LAYER_MASK}
      >
        <primitive object={crownGeometry} attach="geometry" />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
    </group>
  )
}
