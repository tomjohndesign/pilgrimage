"use client"

import { useEffect, useMemo, useRef, type RefObject } from "react"
import { useFrame } from "@react-three/fiber"
import * as THREE from "three"
import { DRIVER_GRIP, driverPoint, reinPoints } from "@/lib/game/transport/driver"
import { animalBit } from "@/lib/game/transport/bridle"
import { TRANSPORT, CART, RIG_TO_WORLD, type Animal, type HorseVariant } from "@/lib/game/transport/assets"
import { spriteRow } from "@/lib/game/character-assets"
import { OUTLINE_ID_LAYER_MASK, SELECTED_CHARACTER_LAYER } from "@/lib/game/render/outline"
import type { FigureClickHandler } from "./traveler-figure"

/** Leather reins follow the displayed driving hands and animal bridle through
 * turns. The shared pixel canvas and selection passes render the thin cords. */
export function CartReins({ cart, animal, kind, horseVariant, characterScale, selected, outlineColor, onClick }: {
  cart: RefObject<THREE.Group | null>; animal: RefObject<THREE.Group | null>; kind: Animal; horseVariant: HorseVariant
  characterScale: number; selected: boolean; outlineColor?: [number, number, number]; onClick?: FigureClickHandler
}) {
  const root = useRef<THREE.Group>(null), body = useRef<THREE.InstancedMesh>(null), ids = useRef<THREE.InstancedMesh>(null)
  const geometry = useMemo(() => new THREE.CylinderGeometry(1, 1, 1, 5), [])
  const dummy = useMemo(() => new THREE.Object3D(), [])
  useEffect(() => () => geometry.dispose(), [geometry])
  useFrame(({ camera }) => {
    const group = root.current, wagon = cart.current, beast = animal.current
    if (!group || !body.current || !wagon || !beast) return
    group.visible = wagon.visible && wagon.userData.riding === true
    if (!group.visible) return
    const sprite = beast.getObjectByName(kind) as THREE.Sprite | undefined
    const data = sprite?.userData ?? beast.userData, unit = RIG_TO_WORLD * characterScale
    const yaw = Math.atan2(camera.matrixWorld.elements[8], camera.matrixWorld.elements[10])
    const cartSprite = wagon.getObjectByName("cart") as THREE.Sprite | undefined
    const driverHeading = yaw - (cartSprite?.userData.row ?? spriteRow(wagon.userData.heading ?? 0, yaw, CART.directions)) * Math.PI * 2 / CART.directions
    const animalHeading = yaw - (data.row ?? spriteRow(data.heading ?? 0, yaw)) * Math.PI / 4
    const origin = wagon.getWorldPosition(new THREE.Vector3()), hitch = (sprite ?? beast).getWorldPosition(new THREE.Vector3())
    let instance = 0
    for (const side of [-1, 1]) {
      const hand = new THREE.Vector3(...driverPoint([side * DRIVER_GRIP.x, DRIVER_GRIP.y, DRIVER_GRIP.z], driverHeading))
        .multiplyScalar(unit).add(origin)
      const frames = TRANSPORT.animalFrames, phase = Math.floor((data.walkPhase ?? 0) * frames) / frames
      const bit = new THREE.Vector3(...animalBit(kind, horseVariant, phase, data.moving === true, side))
        .multiplyScalar(unit).applyAxisAngle(new THREE.Vector3(0, 1, 0), animalHeading).add(hitch)
      const points = reinPoints(hand.toArray(), bit.toArray()).map(p => group.worldToLocal(new THREE.Vector3(...p)))
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1], b = points[i], direction = b.clone().sub(a)
        dummy.position.copy(a).add(b).multiplyScalar(0.5)
        dummy.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize())
        dummy.scale.set(unit * 0.025, direction.length(), unit * 0.025); dummy.updateMatrix()
        body.current.setMatrixAt(instance, dummy.matrix); ids.current?.setMatrixAt(instance, dummy.matrix); instance++
      }
    }
    body.current.instanceMatrix.needsUpdate = true
    if (ids.current) ids.current.instanceMatrix.needsUpdate = true
  })
  return <group ref={root} visible={false}>
    <instancedMesh ref={body} name="cart-reins" args={[geometry, undefined, 24]} frustumCulled={false} onClick={onClick}
      layers-mask={selected ? 1 | (1 << SELECTED_CHARACTER_LAYER) : 1}>
      <meshBasicMaterial color="#493727" toneMapped={false} />
    </instancedMesh>
    {outlineColor && <instancedMesh ref={ids} args={[geometry, undefined, 24]} frustumCulled={false} layers-mask={OUTLINE_ID_LAYER_MASK}>
      <meshBasicMaterial color={new THREE.Color(...outlineColor)} toneMapped={false} />
    </instancedMesh>}
  </group>
}
