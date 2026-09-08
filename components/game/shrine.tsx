"use client"

import { sceneryDetail } from "@/lib/game/render/scenery-detail"
import { useUnitInterior } from "./use-unit-interior"

import { groundHeight } from "@/lib/game/map/elevation"

import { useFrame } from "@react-three/fiber"
import { processionRegistry, relicIsCarried } from "@/lib/game/relic-procession"
import { useMemo, useRef } from "react"
import * as THREE from "three"

import { isSelected, useCameraStore } from "@/lib/game/camera-store"
import { selectElement } from "@/lib/game/selection"
import { tileToWorldX, tileToWorldZ, type GameMap } from "@/lib/game/map/types"
import type { Relic } from "@/lib/game/relic"
import { StructureModel } from "@/components/building-lab/building-model"
import { RelicDisplay } from "./relic-display"
import { shrineStructureParts } from "@/lib/game/building-art/structure"
import { shrineLayout } from "@/lib/game/shrine-layout"
import {
  buildingObjectId,
  encodeObjectId,
  RELIC_OBJECT_ID,
} from "@/lib/game/render/outline"

/** A timber upper nave and lower thatched aisles shelter the rear altar. */
export function Shrine({ map, relic }: { map: GameMap; relic: Relic }) {
  const unitInterior = useUnitInterior(map)
  const relicGroup = useRef<THREE.Group>(null)
  const lights = useRef<THREE.Group>(null)
  useFrame(({ scene }) => {
    const near = sceneryDetail(scene) === 0
    if (lights.current) lights.current.visible = near
    if (relicGroup.current) relicGroup.current.visible = near && (!processionRegistry.current || !relicIsCarried(processionRegistry.current))
  })
  const selected = useCameraStore(s => isSelected(s.selection, { kind: "relic" }) || isSelected(s.selection, { kind: "building", id: map.site?.hovelId ?? "" }))
  const hovelIndex = map.buildings.findIndex((b) => b.id === map.site?.hovelId)
  const hovel = hovelIndex >= 0 ? map.buildings[hovelIndex] : null

  const layout = useMemo(() => {
    if (!hovel || !map.site) return null
    const shape = shrineLayout(hovel, map.site.door)
    return {
      ...shape,
      parts: shrineStructureParts(shape.width, shape.depth),
      centreX: tileToWorldX(map, hovel.x) + (hovel.w - 1) / 2,
      centreZ: tileToWorldZ(map, hovel.z) + (hovel.d - 1) / 2,
      baseY: groundHeight(map, hovel.x + (hovel.w - 1) / 2, hovel.z + (hovel.d - 1) / 2),
    }
  }, [map, hovel])

  const shrineId = useMemo(
    () => new THREE.Color(...encodeObjectId(buildingObjectId(Math.max(0, hovelIndex)))),
    [hovelIndex],
  )
  const relicId = useMemo(() => new THREE.Color(...encodeObjectId(RELIC_OBJECT_ID)), [])

  if (!layout || !hovel) return null

  const select = (event: { delta: number; stopPropagation: () => void }) => selectElement({ kind: "relic" }, event)

  return (
    <group position={[layout.centreX, layout.baseY, layout.centreZ]}>
      <group rotation={[0, layout.rotation, 0]} onClick={event => selectElement({ kind: "building", id: hovel.id }, event)}>
        <StructureModel terrainFloors parts={layout.parts} cutaway={selected || unitInterior === hovel.id} idColor={shrineId} ink={false} />
        <group ref={lights} name="shrine-lights">{[-1,1].map(side => <pointLight key={side} position={[side*.73,.8,layout.altarZ+.08]} color="#ffd184" intensity={.18} distance={1.8} decay={2} />)}</group>
      </group>
      <group ref={relicGroup} position={[layout.offset.x,0,layout.offset.z]}><RelicDisplay color={relic.color} idColor={relicId} onClick={select} /></group>

    </group>
  )
}
