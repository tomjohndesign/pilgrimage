"use client"

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
import { simRegistry } from "@/lib/game/sim"
import { RELIC_TABLE_TOP } from "@/lib/game/building-art/early-geometry"
import { shrineLayout } from "@/lib/game/shrine-layout"
import {
  buildingObjectId,
  encodeObjectId,
  RELIC_OBJECT_ID,
} from "@/lib/game/render/outline"

/** A timber upper nave and lower thatched aisles shelter the rear altar. */
export function Shrine({ map, relic, showInteriors = false }: { map: GameMap; relic: Relic; showInteriors?: boolean }) {
  const unitInterior = useUnitInterior(map)
  const relicGroup = useRef<THREE.Group>(null)
  const veilGroup = useRef<THREE.Group>(null)
  useFrame(() => {
    const sim = simRegistry.current
    const available = !processionRegistry.current || !relicIsCarried(processionRegistry.current)
    const showing = available && sim && sim.world.road === map.road && sim.shrineKeeperReady
      && [...sim.travelers.values()].some(s => s.activity === "visiting" && s.shrineSeat?.startsWith("queue-"))
    if (relicGroup.current) relicGroup.current.visible = !!showing
    if (veilGroup.current) {
      veilGroup.current.scale.y = showing ? .16 : 1
      veilGroup.current.position.y = RELIC_TABLE_TOP * (1 - veilGroup.current.scale.y)
    }
  })
  const selected = useCameraStore(s => isSelected(s.selection, { kind: "relic" }) || isSelected(s.selection, { kind: "building", id: map.site?.hovelId ?? "" }))
  const hovelIndex = map.buildings.findIndex((b) => b.id === map.site?.hovelId)
  const hovel = hovelIndex >= 0 ? map.buildings[hovelIndex] : null

  const layout = useMemo(() => {
    if (!hovel || !map.site) return null
    const shape = shrineLayout(hovel, map.site.door)
    const parts = shrineStructureParts(shape.width, shape.depth)
    return {
      ...shape,
      parts: parts.filter(p => !p.name.startsWith("relic-veil-")),
      veil: parts.filter(p => p.name.startsWith("relic-veil-")),
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
        <StructureModel terrainFloors parts={layout.parts} cutaway={showInteriors || selected || unitInterior === hovel.id} idColor={shrineId} ink={false} />
        <group ref={veilGroup}><StructureModel parts={layout.veil} cutaway idColor={shrineId} ink={false} /></group>
        {[-1,1].map(side => <pointLight key={side} position={[side*.73,.8,layout.altarZ+.08]} color="#ffd184" intensity={.18} distance={1.8} decay={2} />)}
      </group>
      <group ref={relicGroup} position={[layout.offset.x,0,layout.offset.z]}><RelicDisplay groundGlow={false} color={relic.color} idColor={relicId} onClick={select} /></group>

    </group>
  )
}
