"use client"

import { useLayoutEffect, useMemo, useRef } from "react"
import * as THREE from "three"
import { selectElement } from "@/lib/game/selection"
import { encodeObjectId, OUTLINE_ID_LAYER_MASK } from "@/lib/game/render/outline"
import { WOOD_PER_LOG, pileLogCount, type WoodPile as Pile } from "@/lib/game/trees/timber"

/** A stack of logs, with pale cut ends, kept within its patch of the camp yard. */
export function WoodPile({ pile, objectId }: { pile: Pile; objectId: number }) {
  const idColor = useMemo(() => new THREE.Color(...encodeObjectId(objectId)), [objectId])
  const barkId = useRef<THREE.InstancedMesh>(null)
  const endsId = useRef<THREE.InstancedMesh>(null)
  const count = pileLogCount(pile.wood)
  const bark = useRef<THREE.InstancedMesh>(null)
  const ends = useRef<THREE.InstancedMesh>(null)
  const matrix = useMemo(() => new THREE.Matrix4(), [])
  useLayoutEffect(() => {
    if (!bark.current || !ends.current || !barkId.current || !endsId.current) return
    const rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2)
    for (let i = 0; i < count; i++) {
      const fraction = Math.min(1, (pile.wood - i * WOOD_PER_LOG) / WOOD_PER_LOG)
      const layer = Math.floor(i / 4), column = i % 4
      const x = (column - 1.5) * 0.17 + (layer % 2) * 0.025
      const y = 0.13 + layer * 0.145
      matrix.compose(new THREE.Vector3(x, y, 0), rotation, new THREE.Vector3(1, fraction, 1))
      bark.current.setMatrixAt(i, matrix)
      barkId.current.setMatrixAt(i, matrix)
      for (let end = 0; end < 2; end++) {
        matrix.compose(new THREE.Vector3(x, y, (end === 0 ? -1 : 1) * (0.3 * fraction + 0.006)), rotation, new THREE.Vector3(1, 1, 1))
        ends.current.setMatrixAt(i * 2 + end, matrix)
        endsId.current.setMatrixAt(i * 2 + end, matrix)
      }
    }
    for (const mesh of [bark.current, ends.current, barkId.current, endsId.current]) {
      mesh.instanceMatrix.needsUpdate = true
      mesh.computeBoundingSphere()
    }
  }, [count, matrix, pile.wood])
  const select = (event: { delta: number; stopPropagation: () => void }) => selectElement({ kind: "pile", id: pile.id }, event)
  return (
    <group name={`wood-pile-${pile.id}`} onClick={select}>
      <instancedMesh key={`bark-${count}`} ref={bark} args={[undefined, undefined, count]}>
        <cylinderGeometry args={[0.075, 0.082, 0.6, 7]} />
        <meshLambertMaterial color="#765036" />
      </instancedMesh>
      <instancedMesh key={`ends-${count}`} ref={ends} args={[undefined, undefined, count * 2]}>
        <cylinderGeometry args={[0.069, 0.069, 0.012, 7]} />
        <meshLambertMaterial color="#d2ad71" />
      </instancedMesh>
      <instancedMesh key={`bark-id-${count}`} ref={barkId} args={[undefined, undefined, count]} layers-mask={OUTLINE_ID_LAYER_MASK}>
        <cylinderGeometry args={[0.075, 0.082, 0.6, 7]} />
        <meshBasicMaterial color={idColor} toneMapped={false} />
      </instancedMesh>
      <instancedMesh key={`ends-id-${count}`} ref={endsId} args={[undefined, undefined, count * 2]} layers-mask={OUTLINE_ID_LAYER_MASK}>
        <cylinderGeometry args={[0.069, 0.069, 0.012, 7]} />
        <meshBasicMaterial color={idColor} toneMapped={false} />
      </instancedMesh>
    </group>
  )
}
