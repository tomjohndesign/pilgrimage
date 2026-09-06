"use client"

import { useEffect, useMemo, useRef } from "react"
import { useFrame } from "@react-three/fiber"
import * as THREE from "three"
import type { BuildingDef } from "@/lib/game/map/types"
import { rotatedFootprint } from "@/lib/game/building-rotation"
import { isSelected, useCameraStore } from "@/lib/game/camera-store"
import { structureParts } from "@/lib/game/building-art/structure"
import { CHARACTER_PIXEL_SIZE } from "@/lib/game/render/pixel-scale"
import { BASE_CHARACTER_SCALE } from "@/lib/game/base-person/gait"
import { constructionBarTexture, updateConstructionBar, CONSTRUCTION_BAR_WIDTH, CONSTRUCTION_BAR_HEIGHT } from "@/lib/game/render/construction-bar"

/** Show progress above the roof while work advances or the site is selected. */
export function ConstructionProgress({ building, characterScale }: { building: BuildingDef; characterScale: number }) {
  const sprite = useRef<THREE.Sprite>(null)
  const previous = useRef(-1)
  const previousWork = useRef(building.construction?.work ?? 0)
  const texture = useMemo(constructionBarTexture, [])
  useEffect(() => () => texture.dispose(), [texture])
  const height = useMemo(() => {
    const bounds = new THREE.Box3()
    for (const part of structureParts({ ...building, ...rotatedFootprint(building, building.rotation) })) {
      const transform = new THREE.Matrix4().compose(new THREE.Vector3(...part.position),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(...part.rotation ?? [0, 0, 0])), new THREE.Vector3(1, 1, 1))
      if (part.size) bounds.union(new THREE.Box3(new THREE.Vector3(...part.size).multiplyScalar(-0.5), new THREE.Vector3(...part.size).multiplyScalar(0.5)).applyMatrix4(transform))
      else for (let i = 0; i < (part.vertices?.length ?? 0); i += 3) bounds.expandByPoint(new THREE.Vector3().fromArray(part.vertices!, i).applyMatrix4(transform))
    }
    return Math.max(0.8, bounds.max.y) + 0.35
  }, [building])
  useFrame(() => {
    const construction = building.construction
    if (!sprite.current || !construction) return
    const progress = Math.min(1, construction.work / construction.required)
    const active = construction.work > previousWork.current
    previousWork.current = construction.work
    sprite.current.visible = progress < 1 && (active || isSelected(useCameraStore.getState().selection, { kind: "building", id: building.id }))
    const pixels = Math.floor(progress * (CONSTRUCTION_BAR_WIDTH - 4))
    if (pixels !== previous.current) { updateConstructionBar(texture, progress); previous.current = pixels }
  })
  if (!building.construction) return null
  const pixel = CHARACTER_PIXEL_SIZE * characterScale / BASE_CHARACTER_SCALE
  return <sprite ref={sprite} name="construction-progress" visible={false} position={[0, height, 0]} renderOrder={1000}
    scale={[CONSTRUCTION_BAR_WIDTH * pixel, CONSTRUCTION_BAR_HEIGHT * pixel, 1]} raycast={() => {}}>
    <spriteMaterial map={texture} transparent depthTest={false} depthWrite={false} toneMapped={false} />
  </sprite>
}
