"use client"

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from "react"
import { useFrame, useThree } from "@react-three/fiber"
import * as THREE from "three"
import { sceneryDetail } from "@/lib/game/render/scenery-detail"
import { buildingCentre } from "@/lib/game/buildings"
import { isComplete } from "@/lib/game/construction"
import { groundHeight } from "@/lib/game/map/elevation"
import type { BuildingDef, GameMap } from "@/lib/game/map/types"
import { createPaymentFloaters, PAYMENT_LIFETIME } from "@/lib/game/render/payment-floaters"

export interface ConstructionCostHandle { show: (building: BuildingDef) => void }

/** Placement receipts and click-to-replay costs use the same rise/fade as income. */
export const ConstructionCostEffects = forwardRef<ConstructionCostHandle, { map: GameMap; characterScale: number }>(function ConstructionCostEffects({ map, characterScale }, ref) {
  const scene = useThree(state => state.scene)
  const group = useRef<THREE.Group>(null)
  const pool = useRef<ReturnType<typeof createPaymentFloaters> | null>(null)
  const seen = useRef({ world: map.road, ids: new Set(map.buildings.map(b => b.id)) })
  useEffect(() => {
    const effects = createPaymentFloaters(group.current!, "construction-cost")
    pool.current = effects
    return () => { effects.dispose(); pool.current = null }
  }, [])

  const show = useCallback((building: BuildingDef) => {
    if (sceneryDetail(scene) > 0) return
    const cost = building.construction?.cost
    if (!cost || isComplete(building)) return
    const { x, z } = buildingCentre(map, building)
    const y = groundHeight(map, building.x + (building.w - 1) / 2, building.z + (building.d - 1) / 2) + building.height
    let row = 0
    for (const resource of ["gold", "wood"] as const) if (cost[resource] > 0) {
      pool.current?.show({ x, y, z, amount: cost[resource], resource, row: row++ }, characterScale)
    }
  }, [map, characterScale, scene])
  useImperativeHandle(ref, () => ({ show }), [show])
  useEffect(() => {
    // A regenerated world must not replay historical construction receipts.
    if (seen.current.world !== map.road) {
      seen.current = { world: map.road, ids: new Set(map.buildings.map(b => b.id)) }
      pool.current?.step(PAYMENT_LIFETIME)
      return
    }
    for (const building of map.buildings) {
      if (!seen.current.ids.has(building.id)) { seen.current.ids.add(building.id); show(building) }
    }
    // Only newly placed structures emit; stage updates retain the same IDs.
  }, [map.buildings, map.road, show])
  // Click feedback keeps moving even when the simulation is paused.
  useFrame((_, delta) => {
    if (!group.current) return
    const visible = sceneryDetail(scene) === 0
    if (!visible && group.current.visible) pool.current?.step(PAYMENT_LIFETIME)
    group.current.visible = visible
    if (visible) pool.current?.step(Math.min(delta, 0.1))
  }, -2)
  return <group ref={group} name="construction-cost-effects" />
})
