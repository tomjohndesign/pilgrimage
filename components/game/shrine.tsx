"use client"

import { groundHeight } from "@/lib/game/map/elevation"

import { useFrame } from "@react-three/fiber"
import { processionRegistry, relicIsCarried } from "@/lib/game/relic-procession"
import { useMemo, useRef } from "react"
import * as THREE from "three"

import { isSelected, useCameraStore } from "@/lib/game/camera-store"
import { selectElement } from "@/lib/game/selection"
import { tileToWorldX, tileToWorldZ, type GameMap } from "@/lib/game/map/types"
import type { Relic } from "@/lib/game/relic"
import { BuildingModel } from "@/components/building-lab/building-model"
import { RelicDisplay } from "./relic-display"
import { DEFAULT_RECIPE } from "@/lib/game/building-art/style"
import {
  buildingObjectId,
  encodeObjectId,
  RELIC_OBJECT_ID,
} from "@/lib/game/render/outline"

/**
 * A roofless 3×3 relic enclosure with four open gates, rough paving and a
 * central stone table. The relic stays visible without selecting the building.
 */
const WALL_HEIGHT = DEFAULT_RECIPE.wallHeight

export function Shrine({ map, relic }: { map: GameMap; relic: Relic }) {
  const relicGroup = useRef<THREE.Group>(null)
  useFrame(() => {
    if (relicGroup.current) relicGroup.current.visible = !processionRegistry.current || !relicIsCarried(processionRegistry.current)
  })
  const selected = useCameraStore(s => isSelected(s.selection, { kind: "relic" }) || isSelected(s.selection, { kind: "building", id: map.site?.hovelId ?? "" }))
  const hovelIndex = map.buildings.findIndex((b) => b.id === map.site?.hovelId)
  const hovel = hovelIndex >= 0 ? map.buildings[hovelIndex] : null

  const layout = useMemo(() => {
    if (!hovel || !map.site) return null
    const door = map.site.door
    const rotation = door.x < hovel.x ? -Math.PI / 2 : door.x >= hovel.x + hovel.w ? Math.PI / 2 : door.z < hovel.z ? Math.PI : 0
    return {
      rotation,
      recipe: { ...DEFAULT_RECIPE, width: hovel.w, depth: hovel.d },
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
      <group rotation={[0, layout.rotation, 0]}>
        <BuildingModel recipe={layout.recipe} idColor={shrineId} onClick={event => selectElement({ kind: "building", id: hovel.id }, event)} />
      </group>
      <group ref={relicGroup}><RelicDisplay color={relic.color} idColor={relicId} onClick={select} /></group>

      {selected && (
        <mesh position={[0, WALL_HEIGHT + DEFAULT_RECIPE.roofRise + 0.35, 0]}>
          <boxGeometry args={[0.2, 0.05, 0.2]} />
          <meshBasicMaterial color="#d8a93f" />
        </mesh>
      )}
    </group>
  )
}
