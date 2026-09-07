"use client"

import { useLayoutEffect, useMemo, useRef } from "react"
import * as THREE from "three"
import { selectElement } from "@/lib/game/selection"
import { encodeObjectId, OUTLINE_ID_LAYER_MASK } from "@/lib/game/render/outline"
import { WOOD_PER_LOG, pileLogCount, type WoodPile as Pile } from "@/lib/game/trees/timber"
import { WOOD_LOG, woodLogScale } from "@/lib/game/wood-log"
import { useWoodLogGeometry, WoodLogMaterials } from "./wood-log"

/** The character's logs stacked in four columns inside a patch of the camp yard. */
export function WoodPile({ pile, objectId }: { pile: Pile; objectId: number }) {
  const idColor = useMemo(() => new THREE.Color(...encodeObjectId(objectId)), [objectId])
  const logs = useRef<THREE.InstancedMesh>(null)
  const ids = useRef<THREE.InstancedMesh>(null)
  const geometry = useWoodLogGeometry()
  // A full stack represents overflow too, so abundant harvest stays under the roof.
  const count = Math.min(24, pileLogCount(pile.wood))
  useLayoutEffect(() => {
    if (!logs.current || !ids.current) return
    const rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2)
    const scale = woodLogScale(), radius = WOOD_LOG.radius * scale
    const spacing = radius * 2.05
    const matrix = new THREE.Matrix4()
    for (let i = 0; i < count; i++) {
      const fraction = Math.min(1, (pile.wood - i * WOOD_PER_LOG) / WOOD_PER_LOG)
      const layer = Math.floor(i / 4), column = i % 4
      const x = (column - 1.5) * spacing + (layer % 2) * spacing / 2
      const y = radius + layer * spacing * Math.sqrt(3) / 2
      matrix.compose(new THREE.Vector3(x, y, 0), rotation, new THREE.Vector3(scale, scale * fraction, scale))
      logs.current.setMatrixAt(i, matrix)
      ids.current.setMatrixAt(i, matrix)
    }
    for (const mesh of [logs.current, ids.current]) {
      mesh.instanceMatrix.needsUpdate = true
      mesh.computeBoundingSphere()
    }
  }, [count, pile.wood])
  const select = (event: { delta: number; stopPropagation: () => void }) => selectElement({ kind: "pile", id: pile.id }, event)
  return (
    <group name={`wood-pile-${pile.id}`} onClick={select}>
      <instancedMesh key={`logs-${count}`} ref={logs} args={[geometry, undefined, count]}>
        <WoodLogMaterials />
      </instancedMesh>
      <instancedMesh key={`ids-${count}`} ref={ids} args={[geometry, undefined, count]} layers-mask={OUTLINE_ID_LAYER_MASK}>
        <meshBasicMaterial color={idColor} toneMapped={false} />
      </instancedMesh>
    </group>
  )
}
