"use client"

import { useEffect, useLayoutEffect, useMemo, useRef } from "react"
import * as THREE from "three"

import { generateElement, type EnvironmentPlacement, type PrimitiveKind } from "@/lib/game/environment/elements"
import { placeEnvironment } from "@/lib/game/environment/placement"
import type { GameMap } from "@/lib/game/map/types"
import { OUTLINE_ID_LAYER_MASK } from "@/lib/game/render/outline"

export function Environment({ map }: { map: GameMap }) {
  const placements = useMemo(() => placeEnvironment(map), [map])
  return <EnvironmentField placements={placements} />
}

interface Instance {
  matrix: THREE.Matrix4
  color: THREE.Color
}

/**
 * Parametric ground details, shared by the game and asset gallery. Three tiny
 * instanced geometries draw the entire field in six calls including depth IDs.
 * Like the terrain, these small details write ID zero: they occlude hidden
 * outlines without turning every tuft and pebble into a dark contour.
 */
export function EnvironmentField({ placements }: { placements: EnvironmentPlacement[] }) {
  const batches = useMemo(() => {
    const grouped: Record<PrimitiveKind, Instance[]> = { foliage: [], stone: [], blade: [] }
    const parent = new THREE.Matrix4()
    const position = new THREE.Vector3()
    const scale = new THREE.Vector3()
    const rotation = new THREE.Quaternion()
    const up = new THREE.Vector3(0, 1, 0)
    for (const p of placements) {
      parent.compose(position.set(p.x, p.y, p.z), rotation.setFromAxisAngle(up, p.yaw), scale.setScalar(p.scale))
      for (const part of generateElement(p.kind, p.seed)) {
        const matrix = new THREE.Matrix4().compose(
          position.set(part.x, part.y, part.z),
          rotation.setFromAxisAngle(up, part.yaw),
          scale.set(part.rx, part.ry, part.rz),
        ).premultiply(parent)
        grouped[part.primitive].push({
          matrix,
          color: new THREE.Color(part.color).multiplyScalar(part.shade * p.brightness),
        })
      }
    }
    return grouped
  }, [placements])

  return (
    <group name="environment">
      {(Object.keys(batches) as PrimitiveKind[]).map((kind) => (
        <ElementBatch key={kind} kind={kind} instances={batches[kind]} />
      ))}
    </group>
  )
}

function ElementBatch({ kind, instances }: { kind: PrimitiveKind; instances: Instance[] }) {
  const visible = useRef<THREE.InstancedMesh>(null)
  const depth = useRef<THREE.InstancedMesh>(null)
  const geometry = useMemo(() => {
    if (kind === "blade") {
      const blade = new THREE.ConeGeometry(1, 2, 3, 2)
      const positions = blade.getAttribute("position")
      for (let i = 0; i < positions.count; i++) {
        const t = (positions.getY(i) + 1) / 2
        positions.setX(i, positions.getX(i) + t * t * 0.55)
      }
      blade.computeVertexNormals()
      return blade
    }
    return new THREE.IcosahedronGeometry(1, kind === "foliage" ? 1 : 0)
  }, [kind])
  useEffect(() => () => geometry.dispose(), [geometry])
  useLayoutEffect(() => {
    if (!visible.current || !depth.current) return
    instances.forEach(({ matrix, color }, index) => {
      visible.current!.setMatrixAt(index, matrix)
      visible.current!.setColorAt(index, color)
      depth.current!.setMatrixAt(index, matrix)
    })
    for (const mesh of [visible.current, depth.current]) {
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
      mesh.computeBoundingSphere()
    }
  }, [instances])
  if (!instances.length) return null
  const args = [undefined as unknown as THREE.BufferGeometry, undefined as unknown as THREE.Material, instances.length] as const
  return (
    <group>
      <instancedMesh key={`color-${instances.length}`} ref={visible} args={args}>
        <primitive object={geometry} attach="geometry" />
        <meshLambertMaterial flatShading />
      </instancedMesh>
      <instancedMesh key={`depth-${instances.length}`} ref={depth} args={args} layers-mask={OUTLINE_ID_LAYER_MASK}>
        <primitive object={geometry} attach="geometry" />
        <meshBasicMaterial color="black" toneMapped={false} />
      </instancedMesh>
    </group>
  )
}
