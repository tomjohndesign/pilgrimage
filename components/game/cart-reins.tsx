"use client"

import { isWorldVisible } from "@/lib/game/render/visibility"

import { useEffect, useMemo, useRef, type RefObject } from "react"
import { useFrame } from "@react-three/fiber"
import * as THREE from "three"
import { DRIVER_GRIP, driverPoint } from "@/lib/game/transport/driver"
import { reinCurve, reinPixels, reinViewPoint } from "@/lib/game/transport/reins"
import { BASE_PERSON } from "@/lib/game/base-person/pose"
import { animalBit } from "@/lib/game/transport/bridle"
import { TRANSPORT, CART, RIG_TO_WORLD, type Animal, type HorseVariant } from "@/lib/game/transport/assets"
import { spriteRow } from "@/lib/game/character-assets"
import { OUTLINE_ID_LAYER_MASK, SELECTED_CHARACTER_LAYER } from "@/lib/game/render/outline"
import type { FigureClickHandler } from "./traveler-figure"

/** Leather reins follow the displayed driving hands and animal bridle through
 * turns. Native square pixels share the animal’s bake projection and depth. */
export function CartReins({ cart, animal, kind, horseVariant, characterScale, selected, outlineColor, onClick }: {
  cart: RefObject<THREE.Group | null>; animal: RefObject<THREE.Group | null>; kind: Animal; horseVariant: HorseVariant
  characterScale: number; selected: boolean; outlineColor?: [number, number, number]; onClick?: FigureClickHandler
}) {
  const root = useRef<THREE.Group>(null), body = useRef<THREE.InstancedMesh>(null), ids = useRef<THREE.InstancedMesh>(null)
  const geometry = useMemo(() => new THREE.PlaneGeometry(1, 1), [])
  const dummy = useMemo(() => new THREE.Object3D(), [])
  useEffect(() => () => geometry.dispose(), [geometry])
  useFrame(({ camera }) => {
    const group = root.current, wagon = cart.current, beast = animal.current
    if (!group || !body.current || !wagon || !beast) return
    group.visible = wagon.visible && wagon.userData.riding === true
    if (!isWorldVisible(group)) return
    const sprite = beast.getObjectByName(kind) as THREE.Sprite | undefined
    const data = sprite?.userData ?? beast.userData, unit = RIG_TO_WORLD * characterScale
    const yaw = Math.atan2(camera.matrixWorld.elements[8], camera.matrixWorld.elements[10])
    const cartSprite = wagon.getObjectByName("cart") as THREE.Sprite | undefined
    const cartRow = cartSprite?.userData.row ?? spriteRow(wagon.userData.heading ?? 0, yaw, CART.directions)
    const animalRow = data.row ?? spriteRow(data.heading ?? 0, yaw)
    const origin = (cartSprite ?? wagon).getWorldPosition(new THREE.Vector3()).applyMatrix4(camera.matrixWorldInverse)
    const hitch = (sprite ?? beast).getWorldPosition(new THREE.Vector3()).applyMatrix4(camera.matrixWorldInverse)
    const texel = TRANSPORT.scale / TRANSPORT.cellSize * characterScale
    group.updateWorldMatrix(true, false)
    const viewToLocal = group.matrixWorld.clone().invert().multiply(camera.matrixWorld)
    const pitch = BASE_PERSON.camera.pitch * Math.PI / 180
    let instance = 0
    for (const side of [-1, 1]) {
      const handView = reinViewPoint(new THREE.Vector3(...driverPoint([side * DRIVER_GRIP.x, DRIVER_GRIP.y, DRIVER_GRIP.z], 0)), cartRow, CART.directions)
        .multiplyScalar(unit).add(origin)
      const hand = handView.sub(hitch).divideScalar(unit)
        .applyAxisAngle(new THREE.Vector3(1, 0, 0), -pitch)
        .applyAxisAngle(new THREE.Vector3(0, 1, 0), animalRow * Math.PI / 4)
      const frames = TRANSPORT.animalFrames, phase = Math.floor((data.walkPhase ?? 0) * frames) / frames
      const bit = animalBit(kind, horseVariant, phase, data.moving === true, side)
      const curve = reinCurve(hand.toArray(), bit, side, kind, horseVariant)
      const points = curve.getPoints(64).map(p => reinViewPoint(p, animalRow, 8).multiplyScalar(unit))
      for (const pixel of reinPixels(points, texel)) {
        if (instance >= body.current.instanceMatrix.count) break
        dummy.position.copy(pixel).add(hitch)
        // Match the sprite depth shader's small surface clearance.
        dummy.position.z += 0.005
        dummy.quaternion.identity(); dummy.scale.set(texel, texel, 1); dummy.updateMatrix()
        dummy.matrix.premultiply(viewToLocal)
        body.current.setMatrixAt(instance, dummy.matrix); ids.current?.setMatrixAt(instance, dummy.matrix); instance++
      }
    }
    body.current.count = instance
    if (ids.current) ids.current.count = instance
    body.current.instanceMatrix.needsUpdate = true
    if (ids.current) ids.current.instanceMatrix.needsUpdate = true
  })
  return <group ref={root} visible={false}>
    <instancedMesh ref={body} name="cart-reins" args={[geometry, undefined, 2048]} frustumCulled={false} onClick={onClick}
      layers-mask={selected ? 1 | (1 << SELECTED_CHARACTER_LAYER) : 1}>
      <meshBasicMaterial color="#493727" toneMapped={false} />
    </instancedMesh>
    {outlineColor && <instancedMesh ref={ids} args={[geometry, undefined, 2048]} frustumCulled={false} layers-mask={OUTLINE_ID_LAYER_MASK}>
      <meshBasicMaterial color={new THREE.Color(...outlineColor)} toneMapped={false} />
    </instancedMesh>}
  </group>
}
