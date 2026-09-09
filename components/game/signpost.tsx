"use client"

import { useMemo } from "react"
import * as THREE from "three"
import { StructureModel } from "@/components/building-lab/building-model"
import { forestWarningParts } from "@/lib/game/building-art/forest-warning"
import { forestEntrancePlacements } from "@/lib/game/map/forest-entrances"
import { crossroadSignpostParts } from "@/lib/game/building-art/structure"
import { groundHeight } from "@/lib/game/map/elevation"
import { signpostPlacements } from "@/lib/game/map/signpost"
import type { GameMap } from "@/lib/game/map/types"
import { encodeObjectId, SIGNPOST_OBJECT_ID } from "@/lib/game/render/outline"

/** Central waymarkers use the shared pixelated scenery renderer and directional timber boards. */
export function Signpost({ map }: { map: GameMap }) {
  const posts = useMemo(() => signpostPlacements(map).map((post, index) => ({
    ...post,
    parts: crossroadSignpostParts((map.seed ?? 0) + index, post.arms),
    idColor: new THREE.Color(...encodeObjectId(SIGNPOST_OBJECT_ID - index)),
    baseY: groundHeight(map, post.tile.x, post.tile.z),
  })), [map])
  return <group name="crossroads-signposts">{posts.map(post => (
    <group key={`${post.tile.x}:${post.tile.z}`} name="signpost" position={[post.x, post.baseY, post.z]}>
      <StructureModel parts={post.parts} idColor={post.idColor} ink={false} />
    </group>
  ))}</group>
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
