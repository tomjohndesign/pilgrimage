"use client"

import * as THREE from "three"
import { selectElement } from "@/lib/game/selection"
import { encodeObjectId, OUTLINE_ID_LAYER_MASK } from "@/lib/game/render/outline"
import type { TreePlacement } from "@/lib/game/trees/placement"
import { TREE_SPECIES } from "@/lib/game/trees/species"
import { fallenTimberDimensions, type TreeResource } from "@/lib/game/trees/timber"

/** The trunk stays until hauled away; its stump has a separate decay clock. */
export function TreeRemains({ id, objectId, tree, resource, time }: {
  id: number; objectId: number; tree: TreePlacement; resource: TreeResource; time: number
}) {
  const stump = time < (resource.stumpUntil ?? 0)
  const fallen = resource.remainingWood > 0
  if (!stump && !fallen) return null
  const { radius, length, stumpHeight, offsetZ } = fallenTimberDimensions(resource)
  const select = (event: { delta: number; stopPropagation: () => void }) => selectElement({ kind: "tree", id }, event)
  const idColor = new THREE.Color(...encodeObjectId(objectId))
  return (
    <group name={`tree-remains-${id}`} position={[tree.x, tree.y, tree.z]} onClick={select}>
      {stump && <group name={`tree-stump-${id}`}>
        <mesh position={[0, stumpHeight / 2, 0]} layers-mask={OUTLINE_ID_LAYER_MASK}>
          <cylinderGeometry args={[radius, radius * 1.15, stumpHeight, 7]} />
          <meshBasicMaterial color={idColor} toneMapped={false} />
        </mesh>
        <mesh position={[0, stumpHeight / 2, 0]}>
          <cylinderGeometry args={[radius, radius * 1.15, stumpHeight, 7]} />
          <meshLambertMaterial color={TREE_SPECIES[tree.species].trunk.color} />
        </mesh>
        <mesh position={[0, stumpHeight + 0.002, 0]}>
          <cylinderGeometry args={[radius * 0.86, radius * 0.86, 0.008, 7]} />
          <meshLambertMaterial color="#cfac78" />
        </mesh>
        <mesh position={[0, stumpHeight + 0.008, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[radius * 0.4, radius * 0.48, 12]} />
          <meshBasicMaterial color="#967246" />
        </mesh>
      </group>}
      {fallen && <group name={`fallen-tree-${id}`} position={[0, radius, offsetZ]} rotation={[0, 0, Math.PI / 2]}>
        <mesh layers-mask={OUTLINE_ID_LAYER_MASK}>
          <cylinderGeometry args={[radius * resource.trunkTaper, radius, length, 7]} />
          <meshBasicMaterial color={idColor} toneMapped={false} />
        </mesh>
        <mesh>
          <cylinderGeometry args={[radius * resource.trunkTaper, radius, length, 7]} />
          <meshLambertMaterial color={TREE_SPECIES[tree.species].trunk.color} />
        </mesh>
        {[-1, 1].map((end) => <mesh key={end} position={[0, end * (length / 2 + 0.003), 0]}>
          <cylinderGeometry args={[radius * (end === 1 ? resource.trunkTaper : 1) * 0.94, radius * (end === 1 ? resource.trunkTaper : 1) * 0.94, 0.008, 7]} />
          <meshLambertMaterial color="#cfac78" />
        </mesh>)}
      </group>}
    </group>
  )
}
