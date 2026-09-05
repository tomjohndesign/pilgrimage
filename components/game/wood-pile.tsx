"use client"

import { useLayoutEffect, useMemo, useRef } from "react"
import * as THREE from "three"
import { useBuildStore } from "@/lib/game/build-store"
import { isSelected, useCameraStore } from "@/lib/game/camera-store"
import { WOOD_PER_LOG, pileLogCount, type WoodPile as Pile } from "@/lib/game/trees/timber"

/** A stack of logs, with pale cut ends, kept within its patch of the camp yard. */
export function WoodPile({ pile }: { pile: Pile }) {
  const selection = useCameraStore((s) => s.selection)
  const selected = isSelected(selection, { kind: "pile", id: pile.id })
  const count = pileLogCount(pile.wood)
  const bark = useRef<THREE.InstancedMesh>(null)
  const ends = useRef<THREE.InstancedMesh>(null)
  const matrix = useMemo(() => new THREE.Matrix4(), [])
  useLayoutEffect(() => {
    if (!bark.current || !ends.current) return
    const rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2)
    for (let i = 0; i < count; i++) {
      const fraction = Math.min(1, (pile.wood - i * WOOD_PER_LOG) / WOOD_PER_LOG)
      const layer = Math.floor(i / 4), column = i % 4
      const x = (column - 1.5) * 0.17 + (layer % 2) * 0.025
      const y = 0.13 + layer * 0.145
      matrix.compose(new THREE.Vector3(x, y, 0), rotation, new THREE.Vector3(1, fraction, 1))
      bark.current.setMatrixAt(i, matrix)
      for (let end = 0; end < 2; end++) {
        matrix.compose(new THREE.Vector3(x, y, (end === 0 ? -1 : 1) * (0.3 * fraction + 0.006)), rotation, new THREE.Vector3(1, 1, 1))
        ends.current.setMatrixAt(i * 2 + end, matrix)
      }
    }
    for (const mesh of [bark.current, ends.current]) {
      mesh.instanceMatrix.needsUpdate = true
      mesh.computeBoundingSphere()
    }
  }, [count, matrix, pile.wood])
  const select = (event: { delta: number; stopPropagation: () => void }) => {
    if (event.delta > 6 || useBuildStore.getState().tool) return
    event.stopPropagation()
    useCameraStore.getState().select(selected ? null : { kind: "pile", id: pile.id })
  }
  return (
    <group name={`wood-pile-${pile.id}`} onClick={select}>
      <instancedMesh key={`bark-${count}`} ref={bark} args={[undefined, undefined, count]}>
        <cylinderGeometry args={[0.075, 0.082, 0.6, 7]} />
        <meshLambertMaterial color={selected ? "#ae7b39" : "#765036"} />
      </instancedMesh>
      <instancedMesh key={`ends-${count}`} ref={ends} args={[undefined, undefined, count * 2]}>
        <cylinderGeometry args={[0.069, 0.069, 0.012, 7]} />
        <meshLambertMaterial color={selected ? "#f2ce77" : "#d2ad71"} />
      </instancedMesh>
      {selected && <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.045, 0]}>
        <ringGeometry args={[0.4, 0.46, 24]} /><meshBasicMaterial color="#e4bb58" />
      </mesh>}
    </group>
  )
}
