"use client"

import { useMemo } from "react"
import * as THREE from "three"

import { StructureModel } from "@/components/building-lab/building-model"
import { forestWarningParts } from "@/lib/game/building-art/forest-warning"
import { forestEntrancePlacements } from "@/lib/game/map/forest-entrances"
import { signpostParts } from "@/lib/game/building-art/structure"
import { groundHeight } from "@/lib/game/map/elevation"
import { signpostPlacement } from "@/lib/game/map/signpost"
import type { GameMap } from "@/lib/game/map/types"
import { encodeObjectId, SIGNPOST_OBJECT_ID } from "@/lib/game/render/outline"

/**
 * The wayside marker where the shrine's track forks from the road: a riven
 * post in the crook of the junction, a pointed board turned onto the shrine's
 * bearing, and a small cross above it. Placement is decided on the map (see
 * lib/game/map/signpost.ts); this only stands the timber up.
 */
export function Signpost({ map }: { map: GameMap }) {
  const placement = useMemo(() => signpostPlacement(map), [map])
  const parts = useMemo(() => signpostParts(map.seed ?? 0), [map.seed])
  const idColor = useMemo(() => new THREE.Color(...encodeObjectId(SIGNPOST_OBJECT_ID)), [])
  if (!placement) return null
  const baseY = groundHeight(map, placement.x + map.width / 2 - 0.5, placement.z + map.depth / 2 - 0.5)
  return (
    <group name="signpost" position={[placement.x, baseY, placement.z]} rotation={[0, placement.yaw, 0]}>
      <StructureModel parts={parts} idColor={idColor} ink={false} />
    </group>
  )
}

/** Wordless warnings at grove approaches and both mouths of dangerous shortcuts. */
export function ForestWarnings({ map }: { map: GameMap }) {
  const placements = useMemo(() => forestEntrancePlacements(map), [map])
  const parts = useMemo(() => forestWarningParts(map.seed ?? 0), [map.seed])
  const idColor = useMemo(() => new THREE.Color(0, 0, 0), [])
  return <group name="forest-warnings">
    {placements.map((p, i) => <group key={i} position={[p.x, groundHeight(map, p.x + map.width / 2 - .5, p.z + map.depth / 2 - .5), p.z]} rotation={[0, p.yaw, 0]}>
      <StructureModel parts={parts} idColor={idColor} ink={false} />
    </group>)}
  </group>
}
