"use client"

import { useEffect, useLayoutEffect, useMemo } from "react"
import * as THREE from "three"

import { useCameraStore } from "@/lib/game/camera-store"
import { TreeRemains } from "./tree-remains"
import { useBuildStore } from "@/lib/game/build-store"
import { deriveSeed, makeRng, SEED_STREAM } from "@/lib/game/rng"
import { TILE_HEIGHT } from "@/lib/game/map/terrain"
import type { GameMap } from "@/lib/game/map/types"
import {
  encodeObjectId,
  OUTLINE_ID_LAYER_MASK,
  RELIC_OBJECT_ID,
  treeObjectId,
} from "@/lib/game/render/outline"
import { placeTrees, type TreePlacement } from "@/lib/game/trees/placement"
import {
  generateTree,
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
 *  - `Trees` reads a map and asks `placeTrees` (lib/game/trees/placement) where
 *    the trees stand and which species each is: habitat and groves pick the
 *    kind, and each species' footprint and per-tile cap decide how many fit.
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

export type { TreePlacement }

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

export function Trees({ map, placements: supplied }: { map: GameMap; placements?: TreePlacement[] }) {
  const selection = useCameraStore((s) => s.selection)
  const resources = useBuildStore((s) => s.treeResources)
  const time = useBuildStore((s) => s.time)
  const felled = useBuildStore((s) => s.felled)
  const species = useTreeTuningStore((s) => s.species)
  const placements = useMemo(() => supplied ?? placeTrees(map, species), [map, species, supplied])

  const selected = selection?.kind === "tree" ? placements[selection.id] : null
  const resource = selection?.kind === "tree" ? resources.get(selection.id) : null
  const visible = !resource || resource.health > 0 || resource.remainingWood > 0 || time < (resource.stumpUntil ?? 0)
  useEffect(() => {
    if (selection?.kind === "tree" && (!selected || !visible)) useCameraStore.getState().select(null)
  }, [selection, selected, visible])
  const selectTree = (id: number) => {
    const camera = useCameraStore.getState()
    camera.select(camera.selection?.kind === "tree" && camera.selection.id === id ? null : { kind: "tree", id })
  }
  return (
    <group>
      <TreeField placements={placements} hidden={felled} onSelect={selectTree}
        seed={deriveSeed(map.seed ?? 0, SEED_STREAM.treeShapes)} idBase={map.buildings.length} />
      {Array.from(resources, ([id, resource]) => resource.health <= 0 && placements[id]
        ? <TreeRemains key={id} id={id} tree={placements[id]} resource={resource} time={time} /> : null)}
      {selected && visible && <mesh position={[selected.x, selected.y + 0.025, selected.z]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.25, 0.32, 24]} /><meshBasicMaterial color="#e4bb58" depthTest={false} />
      </mesh>}
    </group>
  )
}

interface GrownTree {
  index: number
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
  hidden,
  onSelect,
}: {
  placements: TreePlacement[]
  seed: number
  idBase?: number
  hidden?: ReadonlySet<number>
  onSelect?: (index: number) => void
}) {
  const species = useTreeTuningStore((s) => s.species)
  const variance = useTreeTuningStore((s) => s.variance)

  const grown = useMemo(() => {
    const rng = makeRng(seed)
    const grouped = new Map<TreeSpeciesId, GrownTree[]>()
    // Trees take the ID block between the buildings and the relic. On huge maps
    // IDs wrap rather than overflow: two trees sharing an ID only lose the
    // outline between themselves, and they are far apart.
    const idSpan = RELIC_OBJECT_ID - 1 - idBase
    placements.forEach((placement, index) => {
      const shape = placement.shape ?? generateTree(species[placement.species], rng, variance)
      const objectId = treeObjectId(idBase, index % idSpan)
      let list = grouped.get(placement.species)
      if (!list) grouped.set(placement.species, (list = []))
      list.push({ index, placement, shape, objectId })
    })
    return TREE_SPECIES_ORDER.filter((id) => grouped.has(id)).map((id) => ({
      def: species[id],
      trees: grouped.get(id)!,
    }))
  }, [placements, seed, idBase, species, variance])
  const batches = useMemo(() => grown.map((batch) => ({
    ...batch, trees: hidden ? batch.trees.filter((tree) => !hidden.has(tree.index)) : batch.trees,
  })), [grown, hidden])

  return (
    <group>
      {batches.map(({ def, trees }) => (
        <SpeciesBatch key={def.id} def={def} trees={trees} onSelect={onSelect} />
      ))}
    </group>
  )
}

/** Every tree of one species: trunks in one instanced mesh, crowns in another. */
function SpeciesBatch({ def, trees, onSelect }: { def: TreeSpeciesDef; trees: GrownTree[]; onSelect?: (index: number) => void }) {
  const crownOwners = useMemo(() => trees.flatMap((tree) => tree.shape.crown.map(() => tree.index)), [trees])
  const select = (crown: boolean) => (event: { instanceId?: number; delta: number; stopPropagation: () => void }) => {
    if (!onSelect || event.instanceId === undefined || event.delta > 6 || useBuildStore.getState().tool) return
    const index = crown ? crownOwners[event.instanceId] : trees[event.instanceId]?.index
    if (index === undefined) return
    event.stopPropagation()
    onSelect(index)
  }
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
      <instancedMesh key={`trunk-${trunkCount}`} ref={refs.trunk} args={instancedArgs(trunkCount)} onClick={select(false)}>
        <primitive object={trunkGeometry} attach="geometry" />
        <meshLambertMaterial flatShading />
      </instancedMesh>
      <instancedMesh key={`crown-${crownCount}`} ref={refs.crown} args={instancedArgs(crownCount)} onClick={select(true)}>
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
