"use client"

import { SceneAssetBoundary } from "./scene-assets"
import * as THREE from "three"
import { softenTreeLighting } from "@/lib/game/trees/lighting"
import { selectElement } from "@/lib/game/selection"
import { encodeObjectId, OUTLINE_ID_LAYER_MASK } from "@/lib/game/render/outline"
import type { TreePlacement } from "@/lib/game/trees/placement"
import { TREE_SPECIES } from "@/lib/game/trees/species"
import { fallenTimberDimensions, type TreeResource } from "@/lib/game/trees/timber"
import { TreeStump } from "./tree-stump"

/** The trunk stays until hauled away; its stump has a separate decay clock. */
export function TreeRemains({ id, objectId, tree, resource, time, characterScale }: {
  id: number; objectId: number; tree: TreePlacement; resource: TreeResource; time: number; characterScale: number
}) {
  const fallen = resource.remainingWood > 0
  const stump = fallen || time < (resource.stumpUntil ?? 0)
  if (!stump && !fallen) return null
  const { radius, length, offsetZ } = fallenTimberDimensions(resource)
  const select = (event: { delta: number; stopPropagation: () => void }) => selectElement({ kind: "tree", id }, event)
  const idColor = new THREE.Color(...encodeObjectId(objectId))
  return (
    <group name={`tree-remains-${id}`} position={[tree.x, tree.y, tree.z]} onClick={select}>
      {stump && <SceneAssetBoundary><TreeStump id={id} objectId={objectId} characterScale={characterScale} /></SceneAssetBoundary>}
      {fallen && <group name={`fallen-tree-${id}`} position={[0, radius, offsetZ]} rotation={[0, 0, Math.PI / 2]}>
        <mesh layers-mask={OUTLINE_ID_LAYER_MASK}>
          <cylinderGeometry args={[radius * resource.trunkTaper, radius, length, 7]} />
          <meshBasicMaterial color={idColor} toneMapped={false} />
        </mesh>
        <mesh>
          <cylinderGeometry args={[radius * resource.trunkTaper, radius, length, 7]} />
          <meshLambertMaterial onBeforeCompile={softenTreeLighting} color={TREE_SPECIES[tree.species].trunk.color} />
        </mesh>
        {[-1, 1].map((end) => <mesh key={end} position={[0, end * (length / 2 + 0.003), 0]}>
          <cylinderGeometry args={[radius * (end === 1 ? resource.trunkTaper : 1) * 0.94, radius * (end === 1 ? resource.trunkTaper : 1) * 0.94, 0.008, 7]} />
          <meshLambertMaterial onBeforeCompile={softenTreeLighting} color="#cfac78" />
        </mesh>)}
      </group>}
    </group>
  )
}
