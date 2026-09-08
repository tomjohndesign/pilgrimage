"use client"

import { isWorldVisible } from "@/lib/game/render/visibility"

import { useEffect, useMemo, useRef, type RefObject } from "react"
import { useFrame } from "@react-three/fiber"
import * as THREE from "three"
import { animalBit } from "@/lib/game/transport/bridle"
import { reinPoints } from "@/lib/game/transport/driver"
import { RIG_TO_WORLD, type Animal, type HorseVariant } from "@/lib/game/transport/assets"
import { spriteRow } from "@/lib/game/character-assets"
import type { TreePlacement } from "@/lib/game/trees/placement"
import { OUTLINE_ID_LAYER_MASK, SELECTED_CHARACTER_LAYER } from "@/lib/game/render/outline"
import type { FigureClickHandler } from "./traveler-figure"

/** The same leather tie joins parked mounts and draught animals to a real trunk. */
export function AnimalTether({ animal, kind, horseVariant, characterScale, selected, outlineColor, onClick }: {
  animal: RefObject<THREE.Group | null>; kind: Animal; horseVariant: HorseVariant; characterScale: number
  selected?: boolean; outlineColor?: [number, number, number]; onClick?: FigureClickHandler
}) {
  const root = useRef<THREE.Group>(null), body = useRef<THREE.InstancedMesh>(null), ids = useRef<THREE.InstancedMesh>(null)
  const geometry = useMemo(() => new THREE.CylinderGeometry(1, 1, 1, 5), [])
  const dummy = useMemo(() => new THREE.Object3D(), [])
  useEffect(() => () => geometry.dispose(), [geometry])
  useFrame(({ camera }) => {
    const group = root.current, beast = animal.current, tree = beast?.userData.tether as TreePlacement | undefined
    if (!group || !body.current || !beast) return
    group.visible = beast.visible && !!tree && !tree.walking
    if (!isWorldVisible(group) || !tree) return
    const sprite = beast.getObjectByName(kind) as THREE.Sprite | undefined
    const data = sprite?.userData ?? beast.userData, unit = RIG_TO_WORLD * characterScale
    const yaw = Math.atan2(camera.matrixWorld.elements[8], camera.matrixWorld.elements[10])
    const heading = yaw - (data.row ?? spriteRow(beast.userData.heading ?? 0, yaw)) * Math.PI / 4
    const bit = new THREE.Vector3(...animalBit(kind, horseVariant, 0, false, 1)).multiplyScalar(unit)
      .applyAxisAngle(new THREE.Vector3(0, 1, 0), heading).add((sprite ?? beast).getWorldPosition(new THREE.Vector3()))
    const radius = (tree.shape?.trunkRadius ?? 0.18) * (tree.scale ?? 1) + 0.015
    const angle = Math.atan2(bit.x - tree.x, bit.z - tree.z), height = tree.y + Math.min(0.55, (tree.shape?.trunkHeight ?? 1) * (tree.scale ?? 1) * 0.6)
    const tie = new THREE.Vector3(tree.x + Math.sin(angle) * radius, height, tree.z + Math.cos(angle) * radius)
    const points = reinPoints(bit.toArray(), tie.toArray()).map(p => new THREE.Vector3(...p))
    for (let i = 1; i <= 12; i++) {
      const around = angle + i / 12 * Math.PI * 2
      points.push(new THREE.Vector3(tree.x + Math.sin(around) * radius, height, tree.z + Math.cos(around) * radius))
    }
    points.forEach(p => group.worldToLocal(p))
    body.current.count = points.length - 1
    if (ids.current) ids.current.count = body.current.count
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i], direction = b.clone().sub(a)
      dummy.position.copy(a).add(b).multiplyScalar(0.5)
      dummy.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize())
      dummy.scale.set(unit * 0.025, direction.length(), unit * 0.025); dummy.updateMatrix()
      body.current.setMatrixAt(i - 1, dummy.matrix); ids.current?.setMatrixAt(i - 1, dummy.matrix)
    }
    body.current.instanceMatrix.needsUpdate = true
    if (ids.current) ids.current.instanceMatrix.needsUpdate = true
  })
  return <group ref={root} visible={false}>
    <instancedMesh ref={body} name="animal-tether" args={[geometry, undefined, 32]} frustumCulled={false} onClick={onClick}
      layers-mask={selected ? 1 | (1 << SELECTED_CHARACTER_LAYER) : 1}>
      <meshBasicMaterial color="#493727" toneMapped={false} />
    </instancedMesh>
    {outlineColor && <instancedMesh ref={ids} args={[geometry, undefined, 32]} frustumCulled={false} layers-mask={OUTLINE_ID_LAYER_MASK}>
      <meshBasicMaterial color={new THREE.Color(...outlineColor)} toneMapped={false} />
    </instancedMesh>}
  </group>
}
