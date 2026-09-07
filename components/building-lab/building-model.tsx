"use client"

import { useMemo, useEffect, useRef, useState } from "react"
import * as THREE from "three"
import { useFrame, type ThreeEvent } from "@react-three/fiber"
import { buildingParts, type BuildingPart } from "@/lib/game/building-art/geometry"
import { BUILDING_STYLE, type BuildingRecipe } from "@/lib/game/building-art/style"
import { visibleStructureParts } from "@/lib/game/building-art/structure"
import { wallSide } from "@/lib/game/building-art/cutaway"
import { OUTLINE_ID_LAYER_MASK } from "@/lib/game/render/outline"

import { useTerrainTexture } from "@/components/game/use-terrain-texture"
import { buildingPartGeometry, BUILDING_DIRT_TEXTURE, configureBuildingDirt, dirtFloorMaterial } from "@/lib/game/building-art/part-geometry"

function DirtMaterial({ part }: { part: BuildingPart }) {
  const trail = useTerrainTexture(BUILDING_DIRT_TEXTURE, "#a49372")
  const grass = useTerrainTexture("/textures/grass.png", "#94a158")
  const material = useMemo(() => dirtFloorMaterial(part, configureBuildingDirt(trail), configureBuildingDirt(grass)), [part, trail, grass])
  useEffect(() => () => material.dispose(), [material])
  return <primitive object={material} attach="material" />
}

function Part({ part, idColor, onClick, ghostColor, ink = true, terrainFloors = false }: { part: BuildingPart; idColor?: THREE.Color; onClick?: (event: ThreeEvent<MouseEvent>) => void; ghostColor?: string; ink?: boolean; terrainFloors?: boolean }) {
  const geometry = useMemo(() => buildingPartGeometry(part, !terrainFloors), [part, terrainFloors])
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
  if (terrainFloors && part.surface === "trail") return <mesh geometry={geometry} position={part.position} rotation={part.rotation} onClick={onClick}>
    <meshBasicMaterial transparent opacity={0} depthWrite={false} />
  </mesh>
  return <group position={part.position} rotation={part.rotation}>
    <mesh name={part.name} geometry={geometry} onClick={onClick}>
      {part.surface === "trail" ? <DirtMaterial part={part} /> : <meshLambertMaterial color={part.color} side={THREE.DoubleSide} />}
    </mesh>
    {ink && part.outline !== false && !part.name.startsWith("reed-") && !part.name.startsWith("thatch-grain-") && !part.name.startsWith("thatch-highlight-") && <lineSegments geometry={edges} raycast={() => {}}>
      <lineBasicMaterial color={BUILDING_STYLE.palette.ink} transparent opacity={0.65} />
    </lineSegments>}
    {idColor && part.surface !== "trail" && <mesh geometry={geometry} layers-mask={OUTLINE_ID_LAYER_MASK}>
      <meshBasicMaterial color={idColor} toneMapped={false} side={THREE.DoubleSide} />
    </mesh>}
  </group>
}

/** Material details share meshes, keeping four-view previews inexpensive. */
export function batchDetails(parts: BuildingPart[]): BuildingPart[] {
  const visible: BuildingPart[] = [], groups = new Map<string, BuildingPart>()
  for (const part of parts) {
    if (part.outline !== false || part.surface) { visible.push(part); continue }
    const side = part.layer === "wall" ? wallSide(part) : undefined
    const key = `${part.layer}:${part.color}:${side?.join(",") ?? ""}`
    let batch = groups.get(key)
    if (!batch) { batch = { name: `detail-${key}`, layer: part.layer, cutawaySide: side, position: [0,0,0], vertices: [], color: part.color, outline: false }; groups.set(key,batch) }
    const shape = part.size ? new THREE.BoxGeometry(...part.size).toNonIndexed() : new THREE.BufferGeometry().setAttribute("position",new THREE.Float32BufferAttribute(part.vertices!,3))
    shape.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...part.position),new THREE.Quaternion().setFromEuler(new THREE.Euler(...part.rotation ?? [0,0,0])),new THREE.Vector3(1,1,1)))
    const points = shape.getAttribute("position")
    for(let i=0;i<points.count;i++) batch.vertices!.push(points.getX(i),points.getY(i),points.getZ(i))
    shape.dispose()
  }
  return [...visible,...groups.values()]
}

/** Shared procedural building; cutting away the shell exposes the relic inside. */
export function BuildingModel({ recipe, cutaway = false, idColor, onClick, ink = true, terrainFloors = false }: {
  recipe: BuildingRecipe; terrainFloors?: boolean; cutaway?: boolean; idColor?: THREE.Color; onClick?: (event: ThreeEvent<MouseEvent>) => void; ink?: boolean
}) {
  const parts = useMemo(() => buildingParts(recipe), [recipe])
  return <StructureModel terrainFloors={terrainFloors} parts={parts} cutaway={cutaway} idColor={idColor} onClick={onClick} ink={ink} />
}

/** Ghosts retain every surface, with frame lines only on structural parts. */
export function StructureModel({ parts, idColor, ghostColor, ink = true, cutaway = false, onClick, terrainFloors = false }: {
  parts: BuildingPart[]; onClick?: (event: ThreeEvent<MouseEvent>) => void; idColor?: THREE.Color; ghostColor?: string; ink?: boolean; cutaway?: boolean; terrainFloors?: boolean
}) {
  const rendered = useMemo(() => batchDetails(parts), [parts])
  const root = useRef<THREE.Group>(null)
  const [direction,setDirection] = useState<[number,number]>([1,1])
  const last = useRef("1,1")
  const scratch = useMemo(()=>({direction:new THREE.Vector3(),rotation:new THREE.Quaternion()}),[])
  useFrame(({camera})=>{
    if (!cutaway || !root.current) return
    root.current.getWorldQuaternion(scratch.rotation).invert()
    camera.getWorldDirection(scratch.direction).negate().applyQuaternion(scratch.rotation)
    const next: [number,number] = [Math.sign(scratch.direction.x),Math.sign(scratch.direction.z)]
    const key=next.join(",")
    if(key !== last.current) { last.current=key;setDirection(next) }
  })
  return <group ref={root}>{visibleStructureParts(rendered, cutaway, direction).map((part) => <Part key={part.name} part={part} terrainFloors={terrainFloors} idColor={idColor} ghostColor={ghostColor} onClick={onClick} ink={ink} />)}</group>
}
