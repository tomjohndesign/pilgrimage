"use client"

import { characterBatchEntry } from "@/lib/game/render/character-batch"
import { applyAttachmentDepth } from "@/lib/game/render/sprite-depth"
import { usePixelSceneryDepth } from "@/components/pixel-canvas"
import { isWorldVisible } from "@/lib/game/render/visibility"

import { useEffect, useMemo, useRef, type RefObject } from "react"
import { useFrame } from "@react-three/fiber"
import * as THREE from "three"
import { handlerHand, handlerHandView, type HandlerClip } from "@/lib/game/transport/handler-assets"
import type { TravelerTypeId } from "@/lib/game/travelers"
import { DRIVER_GRIP, driverPoint, reinPoints } from "@/lib/game/transport/driver"
import { reinCurve, reinPixels, reinViewPoint } from "@/lib/game/transport/reins"
import { BASE_PERSON } from "@/lib/game/base-person/pose"
import { spinePoint } from "@/lib/game/transport/animal-pose"
import { animalProfile } from "@/lib/game/transport/assets"
import { animalBit } from "@/lib/game/transport/bridle"
import { TRANSPORT, CART, RIG_TO_WORLD, type Animal, type HorseVariant } from "@/lib/game/transport/assets"
import { spriteRow } from "@/lib/game/character-assets"
import { useCameraStore } from "@/lib/game/camera-store"
import { OUTLINE_ID_LAYER_MASK, SELECTED_CHARACTER_LAYER } from "@/lib/game/render/outline"
import type { FigureClickHandler } from "./traveler-figure"

/** Beyond this camera view size a rein pixel is smaller than a screen pixel; skip it. */
const REINS_MAX_VIEW_SIZE = 90
/** Leather reins follow the displayed driving hands and animal bridle through
 * turns. Native square pixels share the animal’s bake projection and depth.
 * The strap is rebuilt only when the wagon, animal, pose or camera changed. */
export function CartReins({ driver, handler, draft = false, seatOffset = 0, cart, animal, kind, horseVariant, characterScale, selected, outlineColor, onClick }: {
  driver?: () => THREE.Object3D | null | undefined
  handler?: { calling: TravelerTypeId; variant: number }
  draft?: boolean; seatOffset?: number
  cart: RefObject<THREE.Group | null>; animal: RefObject<THREE.Group | null>; kind: Animal; horseVariant: HorseVariant
  characterScale: number; selected: boolean; outlineColor?: [number, number, number]; onClick?: FigureClickHandler
}) {
  const root = useRef<THREE.Group>(null), body = useRef<THREE.InstancedMesh>(null), ids = useRef<THREE.InstancedMesh>(null)
  const sceneryDepth = usePixelSceneryDepth()
  const depthBias = useMemo(() => ({ value: 0 }), [])
  const endpointBiases = useMemo(() => ({ value: new THREE.Vector3() }), [])
  const viewport = useMemo(() => new THREE.Vector4(), [])
  const materials = useMemo(() => ["#493727", "#ffffff"].map(color => {
    const material = new THREE.MeshBasicMaterial({ color, toneMapped: false })
    material.onBeforeCompile = shader => applyAttachmentDepth(shader, viewport, depthBias, sceneryDepth, endpointBiases)
    material.onBeforeRender = renderer => { renderer.getCurrentViewport(viewport) }
    material.customProgramCacheKey = () => "rail-attachment-depth-v2"
    return material
  }), [viewport, depthBias, sceneryDepth, endpointBiases])
  useEffect(() => () => materials.forEach(material => material.dispose()), [materials])
  // Recompute endpoint depths after global sorting, even while paused. Each
  // strap pixel interpolates its two endpoints without joining their rails.
  useFrame(() => {
    if (!isWorldVisible(root.current)) return
    const bias = (object: THREE.Object3D | undefined | null) => object instanceof THREE.Sprite ? characterBatchEntry(object)?.depthBias?.value ?? 0 : 0
    const wagon = cart.current
    const source = wagon?.getObjectByName(handler ? "traveler" : "cart")
    const rider = handler ? source : driver?.()?.getObjectByName("passenger") ?? wagon?.getObjectByName("driver")
    endpointBiases.value.set(bias(source), bias(rider), bias(animal.current?.getObjectByName(kind)))
  }, .75)
  const geometry = useMemo(() => {
    const mesh = new THREE.PlaneGeometry(1, 1)
    mesh.setAttribute("attachmentPath", new THREE.InstancedBufferAttribute(new Float32Array(2048 * 2), 2))
    return mesh
  }, [])
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const previous = useMemo(() => new Float64Array(12).fill(NaN), [])
  const scratch = useMemo(() => ({ origin: new THREE.Vector3(), hitch: new THREE.Vector3(), viewToLocal: new THREE.Matrix4() }), [])
  useEffect(() => () => geometry.dispose(), [geometry])
  useFrame(({ camera }) => {
    const group = root.current, wagon = cart.current, beast = animal.current
    if (!group || !body.current) return
    if (!wagon || !beast) { group.visible=false; return }
    group.visible = useCameraStore.getState().viewSize <= REINS_MAX_VIEW_SIZE && wagon.visible && beast.visible &&
      (handler ? ["walking","fleeing"].includes(wagon.userData.activity) &&
      wagon.position.distanceTo(beast.position)<3*characterScale : draft || wagon.userData.riding === true)
    if (!isWorldVisible(group)) return
    const sprite = beast.getObjectByName(kind) as THREE.Sprite | undefined
    const data = sprite?.userData ?? beast.userData, unit = RIG_TO_WORLD * characterScale
    const yaw = Math.atan2(camera.matrixWorld.elements[8], camera.matrixWorld.elements[10])
    const cartSprite = wagon.getObjectByName(handler ? "traveler" : "cart") as THREE.Sprite | undefined
    const cartRow = cartSprite?.userData.row ?? spriteRow(wagon.userData.heading ?? 0, yaw, CART.directions)
    const animalRow = data.row ?? spriteRow(data.heading ?? 0, yaw)
    const origin = (cartSprite ?? wagon).getWorldPosition(scratch.origin).applyMatrix4(camera.matrixWorldInverse)
    const hitch = (sprite ?? beast).getWorldPosition(scratch.hitch).applyMatrix4(camera.matrixWorldInverse)
    // Nothing that shapes the strap changed since the last frame: keep it.
    const state = [origin.x, origin.y, origin.z, hitch.x, hitch.y, hitch.z, yaw, data.walkPhase ?? 0, cartRow, animalRow,
      wagon.userData.riding === true ? 1 : 0, handler ? (cartSprite?.userData.displayedFrame ?? 0) + (cartSprite?.userData.clip === "wearyWalk" ? 100 : cartSprite?.userData.clip === "walk" ? 200 : 0) : 0]
    let same = true
    for (let i = 0; i < state.length; i++) if (previous[i] !== state[i]) { same = false; previous[i] = state[i] }
    if (same) return
    const texel = TRANSPORT.scale / TRANSPORT.cellSize * characterScale
    group.updateWorldMatrix(true, false)
    const viewToLocal = scratch.viewToLocal.copy(group.matrixWorld).invert().multiply(camera.matrixWorld)
    const pitch = BASE_PERSON.camera.pitch * Math.PI / 180
    let instance = 0
    const path = geometry.getAttribute("attachmentPath") as THREE.InstancedBufferAttribute
    const draw = (points: THREE.Vector3[], driverSource = false) => {
      const start = points[0], end = points[points.length - 1]
      const dx = end.x - start.x, dy = end.y - start.y, dz = end.z - start.z
      const lengthSq = dx * dx + dy * dy + dz * dz

      for (const pixel of reinPixels(points, texel)) {
        if (instance >= body.current!.instanceMatrix.count) break
        const t = lengthSq ? ((pixel.x - start.x) * dx + (pixel.y - start.y) * dy + (pixel.z - start.z) * dz) / lengthSq : 0
        path.setXY(instance, Math.max(0, Math.min(1, t)), driverSource ? 1 : 0)
        dummy.position.copy(pixel); dummy.position.z += .005
        dummy.quaternion.identity(); dummy.scale.set(texel, texel, 1); dummy.updateMatrix()
        dummy.matrix.premultiply(viewToLocal)
        body.current!.setMatrixAt(instance, dummy.matrix); ids.current?.setMatrixAt(instance, dummy.matrix); instance++
      }
    }
    if (ids.current && !ids.current.instanceColor) {
      ids.current.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(ids.current.instanceMatrix.count * 3), 3)
    }
    if (ids.current && outlineColor) {
      const colors = ids.current.instanceColor!
      if (colors.getX(0) !== outlineColor[0] || colors.getY(0) !== outlineColor[1] || colors.getZ(0) !== outlineColor[2]) {
        for (let i = 0; i < colors.count; i++) colors.setXYZ(i, outlineColor[0], outlineColor[1], outlineColor[2])
        colors.needsUpdate = true
      }
    }
    for (const side of [-1, 1]) {
      if (draft) {
        const phase = data.walkPhase ?? 0, moving = data.moving === true, profile = animalProfile(kind, horseVariant)
        const source = reinViewPoint(new THREE.Vector3(side * .58, .65, .6), cartRow, CART.directions).multiplyScalar(unit).add(origin)
        const at = spinePoint([side * (kind === "ox" ? .5 : .36), profile.legHeight + (kind === "ox" ? .58 : .14), kind === "ox" ? .48 : .55], kind, phase, moving, horseVariant)
        const target = reinViewPoint(new THREE.Vector3(...at), animalRow, 8).multiplyScalar(unit).add(hitch)
        draw(Array.from({ length: 33 }, (_, i) => source.clone().lerp(target, i / 32)))
      }
      if ((!handler && kind === "ox") || (handler ? side !== 1 : !wagon.userData.riding)) continue
      const handClip = (cartSprite?.userData.clip === "wearyWalk" ? "wearyWalk" : cartSprite?.userData.clip === "walk" ? "walk" : "idle") as HandlerClip
      const socket = handler && handlerHand(handler.calling, handler.variant, handClip, cartSprite?.userData.direction ?? 0, handClip === "idle" ? 0 : cartSprite?.userData.displayedFrame ?? 0)
      const handView = socket ? new THREE.Vector3(...handlerHandView(socket, (cartSprite?.scale.x ?? 1) / 64)).add(origin) : reinViewPoint(new THREE.Vector3(...driverPoint([seatOffset + side * DRIVER_GRIP.x, DRIVER_GRIP.y, DRIVER_GRIP.z], 0)), cartRow, CART.directions)
        .multiplyScalar(unit).add(origin)
      const hand = handView.sub(hitch).divideScalar(unit)
        .applyAxisAngle(new THREE.Vector3(1, 0, 0), -pitch)
        .applyAxisAngle(new THREE.Vector3(0, 1, 0), animalRow * Math.PI / 4)
      const frames = TRANSPORT.animalFrames, phase = Math.floor((data.walkPhase ?? 0) * frames) / frames
      const bit = animalBit(kind, horseVariant, phase, data.moving === true, side)
      const curve = handler ? reinPoints(hand.toArray(), bit).map(p => new THREE.Vector3(...p))
        : reinCurve(hand.toArray(), bit, side, kind, horseVariant).getPoints(64)
      const points = curve.map(p => reinViewPoint(p, animalRow, 8).multiplyScalar(unit))
      draw(points.map(point => point.add(hitch)), true)
    }
    path.needsUpdate = true
    body.current.count = instance
    if (ids.current) ids.current.count = instance
    body.current.instanceMatrix.needsUpdate = true
    if (ids.current) ids.current.instanceMatrix.needsUpdate = true
  })
  return <group ref={root} visible={false}>
    <instancedMesh ref={body} name={handler ? "animal-lead" : "cart-reins"} args={[geometry, materials[0], 2048]} frustumCulled={false} onClick={onClick}
      layers-mask={selected ? 1 | (1 << SELECTED_CHARACTER_LAYER) : 1} />
    {outlineColor && <instancedMesh ref={ids} args={[geometry, materials[1], 2048]} frustumCulled={false} layers-mask={OUTLINE_ID_LAYER_MASK} />}
  </group>
}
