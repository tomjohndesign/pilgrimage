"use client"

import { useCameraStore } from "@/lib/game/camera-store"
import { TERRAIN } from "@/lib/game/map/terrain"
import { tileAt, tileToWorldX, tileToWorldZ, type GameMap } from "@/lib/game/map/types"

/**
 * Highlight for the tile under the cursor. Mostly here to prove the
 * screen-to-grid mapping holds up across all four rotations and zoom levels.
 */
export function TileCursor({ map }: { map: GameMap }) {
  const hovered = useCameraStore((s) => s.hovered)
  if (!hovered) return null

  const terrain = tileAt(map, hovered.x, hovered.z)
  if (!terrain) return null

  const y = TERRAIN[terrain].height

  return (
    <mesh position={[tileToWorldX(map, hovered.x), y + 0.015, tileToWorldZ(map, hovered.z)]}>
      <boxGeometry args={[1, 0.03, 1]} />
      <meshBasicMaterial color="#f2e8d5" transparent opacity={0.4} depthWrite={false} />
    </mesh>
  )
}
