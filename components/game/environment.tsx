"use client"

import { memo, useEffect, useLayoutEffect, useMemo, useRef } from "react"
import * as THREE from "three"

import { ELEMENT_RADIUS, generateElement, type EnvironmentPlacement, type PrimitiveKind } from "@/lib/game/environment/elements"
import { placeEnvironment } from "@/lib/game/environment/placement"
import type { GameMap } from "@/lib/game/map/types"
import { blockKey } from "@/lib/game/render/blocks"
import { OUTLINE_ID_LAYER_MASK } from "@/lib/game/render/outline"

export function Environment({ map }: { map: GameMap }) {
  const placements = useMemo(() => placeEnvironment(map), [map])
  const buildings = map.buildings
  const visible = useMemo(() => placements.filter((p) => {
    const radius = ELEMENT_RADIUS * p.scale
    const x = p.x + map.width / 2
    const z = p.z + map.depth / 2
    return !buildings.some((b) => x + radius > b.x && x - radius < b.x + b.w &&
      z + radius > b.z && z - radius < b.z + b.d)
  }), [placements, buildings, map.width, map.depth])
  return <EnvironmentField placements={visible} />
}

interface Instance {
  matrix: THREE.Matrix4
  color: THREE.Color
}

const PRIMITIVE_KINDS: PrimitiveKind[] = ["foliage", "stone", "blade"]

function makeElementGeometry(kind: PrimitiveKind): THREE.BufferGeometry {
  if (kind !== "blade") return new THREE.IcosahedronGeometry(1, kind === "foliage" ? 1 : 0)
  const blade = new THREE.ConeGeometry(1, 2, 3, 2)
  const positions = blade.getAttribute("position")
  for (let i = 0; i < positions.count; i++) {
    const t = (positions.getY(i) + 1) / 2
    positions.setX(i, positions.getX(i) + t * t * 0.55)
  }
  blade.computeVertexNormals()
  return blade
}

/**
 * Parametric ground details, shared by the game and asset gallery. Three tiny
 * instanced geometries draw the entire field, split into world-space blocks so
 * the camera only pays for the tufts and pebbles it can see — one batch per
 * kind spanning the map never clears the frustum test (see
 * lib/game/render/blocks). Like the terrain, these small details write ID zero:
 * they occlude hidden outlines without turning every tuft and pebble into a
 * dark contour.
 */
export function EnvironmentField({ placements }: { placements: EnvironmentPlacement[] }) {
  const batches = useMemo(() => {
    const grouped = new Map<string, { kind: PrimitiveKind; block: number; instances: Instance[] }>()
    const parent = new THREE.Matrix4()
    const position = new THREE.Vector3()
    const scale = new THREE.Vector3()
    const rotation = new THREE.Quaternion()
    const up = new THREE.Vector3(0, 1, 0)
    for (const p of placements) {
      parent.compose(position.set(p.x, p.y, p.z), rotation.setFromAxisAngle(up, p.yaw), scale.setScalar(p.scale))
      // All of an element's parts share its block, so a tuft is never split
      // across two batches and its pieces always cull together.
      const block = blockKey(p.x, p.z)
      for (const part of generateElement(p.kind, p.seed)) {
        const matrix = new THREE.Matrix4().compose(
          position.set(part.x, part.y, part.z),
          rotation.setFromAxisAngle(up, part.yaw),
          scale.set(part.rx, part.ry, part.rz),
        ).premultiply(parent)
        const key = `${part.primitive}:${block}`
        let group = grouped.get(key)
        if (!group) grouped.set(key, (group = { kind: part.primitive, block, instances: [] }))
        group.instances.push({
          matrix,
          color: new THREE.Color(part.color).multiplyScalar(part.shade * p.brightness),
        })
      }
    }
    // Kind first, so blocks sharing a geometry and material render together;
    // block order is stable, so React keys never reshuffle.
    return [...grouped].sort(([, a], [, b]) =>
      PRIMITIVE_KINDS.indexOf(a.kind) - PRIMITIVE_KINDS.indexOf(b.kind) || a.block - b.block)
  }, [placements])

  // One geometry per kind, shared by all of its blocks: the blocks differ only
  // in which instances they carry.
  const geometries = useMemo(() => new Map(PRIMITIVE_KINDS.map((kind) => [kind, makeElementGeometry(kind)])), [])
  useEffect(() => () => { for (const geometry of geometries.values()) geometry.dispose() }, [geometries])

  return (
    <group name="environment">
      {batches.map(([key, { kind, instances }]) => (
        <ElementBatch key={key} geometry={geometries.get(kind)!} instances={instances} />
      ))}
    </group>
  )
}

/**
 * One primitive kind within one world block; blocks are what the frustum culls.
 * Memoised, since a map holds hundreds of blocks and their instances only
 * change when the placements themselves do.
 */
const ElementBatch = memo(function ElementBatch({ geometry, instances }: {
  /** Owned by EnvironmentField and shared with this kind's other blocks. */
  geometry: THREE.BufferGeometry
  instances: Instance[]
}) {
  const visible = useRef<THREE.InstancedMesh>(null)
  const depth = useRef<THREE.InstancedMesh>(null)
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
})
