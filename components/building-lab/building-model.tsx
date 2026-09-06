"use client"

import { useMemo, useEffect } from "react"
import * as THREE from "three"
import type { ThreeEvent } from "@react-three/fiber"
import { buildingParts, type BuildingPart } from "@/lib/game/building-art/geometry"
import { BUILDING_STYLE, type BuildingRecipe } from "@/lib/game/building-art/style"
import { visibleStructureParts } from "@/lib/game/building-art/structure"
import { OUTLINE_ID_LAYER_MASK } from "@/lib/game/render/outline"

function Part({ part, idColor, onClick, ghostColor, ink = true }: { part: BuildingPart; idColor?: THREE.Color; onClick?: (event: ThreeEvent<MouseEvent>) => void; ghostColor?: string; ink?: boolean }) {
  const geometry = useMemo(() => {
    if (part.size) return new THREE.BoxGeometry(...part.size)
    const result = new THREE.BufferGeometry()
    result.setAttribute("position", new THREE.Float32BufferAttribute(part.vertices!, 3))
    result.computeVertexNormals()
    return result
  }, [part])
  const edges = useMemo(() => new THREE.EdgesGeometry(geometry, 25), [geometry])
  useEffect(() => () => { geometry.dispose(); edges.dispose() }, [geometry, edges])
  if (ghostColor) return <group position={part.position} rotation={part.rotation}>
    <mesh geometry={geometry} renderOrder={4} raycast={() => {}}>
      <meshBasicMaterial color={ghostColor} transparent opacity={0.12} depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
    {part.outline !== false && <lineSegments geometry={edges} renderOrder={5} raycast={() => {}}>
      <lineBasicMaterial color={ghostColor} transparent opacity={0.8} depthWrite={false} />
    </lineSegments>}
  </group>
  return <group position={part.position} rotation={part.rotation}>
    <mesh name={part.name} geometry={geometry} onClick={onClick}>
      <meshLambertMaterial color={part.color} side={THREE.DoubleSide} />
    </mesh>
    {ink && part.outline !== false && !part.name.startsWith("reed-") && !part.name.startsWith("thatch-grain-") && !part.name.startsWith("thatch-highlight-") && <lineSegments geometry={edges} raycast={() => {}}>
      <lineBasicMaterial color={BUILDING_STYLE.palette.ink} transparent opacity={0.65} />
    </lineSegments>}
    {idColor && <mesh geometry={geometry} layers-mask={OUTLINE_ID_LAYER_MASK}>
      <meshBasicMaterial color={idColor} toneMapped={false} side={THREE.DoubleSide} />
    </mesh>}
  </group>
}

/** Material details share meshes, keeping four-view previews inexpensive. */
export function batchDetails(parts: BuildingPart[]): BuildingPart[] {
  const visible: BuildingPart[] = [], groups = new Map<string, BuildingPart>()
  for (const part of parts) {
    if (part.outline !== false) { visible.push(part); continue }
    const key = `${part.layer}:${part.color}`
    let batch = groups.get(key)
    if (!batch) { batch = { name: `detail-${key}`, layer: part.layer, position: [0,0,0], vertices: [], color: part.color, outline: false }; groups.set(key,batch) }
    const shape = part.size ? new THREE.BoxGeometry(...part.size).toNonIndexed() : new THREE.BufferGeometry().setAttribute("position",new THREE.Float32BufferAttribute(part.vertices!,3))
    shape.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...part.position),new THREE.Quaternion().setFromEuler(new THREE.Euler(...part.rotation ?? [0,0,0])),new THREE.Vector3(1,1,1)))
    const points = shape.getAttribute("position")
    for(let i=0;i<points.count;i++) batch.vertices!.push(points.getX(i),points.getY(i),points.getZ(i))
    shape.dispose()
  }
  return [...visible,...groups.values()]
}

/** Shared procedural building; cutting away the shell exposes the relic inside. */
export function BuildingModel({ recipe, cutaway = false, idColor, onClick, ink = true }: {
  recipe: BuildingRecipe; cutaway?: boolean; idColor?: THREE.Color; onClick?: (event: ThreeEvent<MouseEvent>) => void; ink?: boolean
}) {
  const parts = useMemo(() => batchDetails(buildingParts(recipe)), [recipe])
  return <group name="ink-and-thatch-building">{visibleStructureParts(parts, cutaway).map((part) => <Part key={part.name} part={part} idColor={idColor} onClick={onClick} ink={ink} />)}</group>
}

/** Ghosts retain every surface, with frame lines only on structural parts. */
export function StructureModel({ parts, idColor, ghostColor, ink = true, cutaway = false }: {
  parts: BuildingPart[]; idColor?: THREE.Color; ghostColor?: string; ink?: boolean; cutaway?: boolean
}) {
  const rendered = useMemo(() => batchDetails(parts), [parts])
  return <group>{visibleStructureParts(rendered, cutaway).map((part) => <Part key={part.name} part={part} idColor={idColor} ghostColor={ghostColor} ink={ink} />)}</group>
}
