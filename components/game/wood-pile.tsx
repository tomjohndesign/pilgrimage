"use client"

import { useLayoutEffect, useMemo, useRef } from "react"
import * as THREE from "three"
import { selectElement } from "@/lib/game/selection"
import { encodeObjectId, OUTLINE_ID_LAYER_MASK } from "@/lib/game/render/outline"
import type { WoodPile as Pile } from "@/lib/game/trees/timber"
import { WOOD_LOG, woodLogScale } from "@/lib/game/wood-log"
import { WOOD_PILE_LAYOUT, woodPileLogs } from "@/lib/game/wood-pile"
import { useWoodLogGeometry, WoodLogMaterials } from "./wood-log"

/** Low rows of timber share the character's bark, cut ends and pixel renderer. */
export function WoodPile({ pile, objectId, availableWidth }: { pile: Pile; objectId: number; availableWidth?: number }) {
  const idColor = useMemo(() => new THREE.Color(...encodeObjectId(objectId)), [objectId])
  const logs = useRef<THREE.InstancedMesh>(null)
  const ids = useRef<THREE.InstancedMesh>(null)
  const geometry = useWoodLogGeometry()
  const layout = useMemo(() => woodPileLogs(pile.wood, availableWidth), [pile.wood, availableWidth])
  const count = layout.length
  useLayoutEffect(() => {
    if (!logs.current || !ids.current) return
    const rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2)
    const scale = woodLogScale()
    const matrix = new THREE.Matrix4()
    for (let i = 0; i < count; i++) {
      const { x, y, length } = layout[i]
      matrix.compose(new THREE.Vector3(x, y, 0), rotation, new THREE.Vector3(scale, length / WOOD_LOG.length, scale))
      logs.current.setMatrixAt(i, matrix)
      ids.current.setMatrixAt(i, matrix)
    }
    for (const mesh of [logs.current, ids.current]) {
      mesh.count = count
      mesh.instanceMatrix.needsUpdate = true
      mesh.computeBoundingSphere()
    }
  }, [count, layout])
  const select = (event: { delta: number; stopPropagation: () => void }) => selectElement({ kind: "pile", id: pile.id }, event)
  return (
    <group name={`wood-pile-${pile.id}`} onClick={select}>
      <instancedMesh ref={logs} args={[geometry, undefined, WOOD_PILE_LAYOUT.maxLogs]}>
        <WoodLogMaterials />
      </instancedMesh>
      <instancedMesh ref={ids} args={[geometry, undefined, WOOD_PILE_LAYOUT.maxLogs]} layers-mask={OUTLINE_ID_LAYER_MASK}>
        <meshBasicMaterial color={idColor} toneMapped={false} />
      </instancedMesh>
    </group>
  )
}
