"use client"

import { useBuildStore } from "@/lib/game/build-store"
import { BUILDING_KINDS, placementProblem } from "@/lib/game/buildings"
import { useCameraStore } from "@/lib/game/camera-store"
import { TILE_HEIGHT } from "@/lib/game/map/terrain"
import { tileAt, tileToWorldX, tileToWorldZ, type GameMap } from "@/lib/game/map/types"

/**
 * Highlight for the tile under the cursor. Mostly here to prove the
 * screen-to-grid mapping holds up across all four rotations and zoom levels.
 *
 * In development builds, hovering river water (or a bridge over it) also shows
 * the flow direction as an arrow floating over the tile.
 */
export function TileCursor({ map }: { map: GameMap }) {
  const hovered = useCameraStore((s) => s.hovered)
  const tool = useBuildStore((s) => s.tool)
  const buildings = useBuildStore((s) => s.buildings)
  if (!hovered) return null

  if (!tileAt(map, hovered.x, hovered.z)) return null

  const def = tool ? BUILDING_KINDS[tool] : null
  const problem = tool ? placementProblem(map, [...map.buildings, ...buildings], tool, hovered.x, hovered.z) : null
  const w = def?.w ?? 1
  const d = def?.d ?? 1
  const index = hovered.z * map.width + hovered.x
  const y = TILE_HEIGHT
  const flow = process.env.NODE_ENV !== "production" ? map.water?.flow[index] : undefined

  return (
    <group>
      <mesh position={[tileToWorldX(map, hovered.x) + (w - 1) / 2, y + 0.015, tileToWorldZ(map, hovered.z) + (d - 1) / 2]}>
        <boxGeometry args={[w, 0.03, d]} />
        <meshBasicMaterial color={tool ? (problem ? "#bd5342" : "#9ebc62") : "#f2e8d5"} transparent opacity={0.4} depthWrite={false} />
      </mesh>
      {flow && (
        // Arrow modelled pointing +X, yawed onto the flow direction. A Y
        // rotation of θ maps +X to (cos θ, 0, −sin θ), hence the −dz.
        <group
          position={[tileToWorldX(map, hovered.x), y + 0.4, tileToWorldZ(map, hovered.z)]}
          rotation={[0, Math.atan2(-flow[1], flow[0]), 0]}
        >
          <mesh position={[-0.08, 0, 0]}>
            <boxGeometry args={[0.4, 0.06, 0.1]} />
            <meshBasicMaterial color="#f2e8d5" />
          </mesh>
          <mesh position={[0.23, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
            <coneGeometry args={[0.14, 0.24, 4]} />
            <meshBasicMaterial color="#f2e8d5" />
          </mesh>
        </group>
      )}
    </group>
  )
}
