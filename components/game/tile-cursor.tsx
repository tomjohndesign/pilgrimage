"use client"

import { canAfford, placementError, type Resources } from "@/lib/game/settlement"
import { useBalanceStore } from "@/lib/game/balance-store"
import { buildCatalog } from "@/lib/game/balance"
import { useCameraStore } from "@/lib/game/camera-store"
import { surfaceHeight } from "@/lib/game/map/bridges"
import { tileAt, tileToWorldX, tileToWorldZ, type GameMap } from "@/lib/game/map/types"

/**
 * Highlight for the tile under the cursor. Mostly here to prove the
 * screen-to-grid mapping holds up across all four rotations and zoom levels.
 *
 * In development builds, hovering river water (or a bridge over it) also shows
 * the flow direction as an arrow floating over the tile.
 */
export function TileCursor({
  map,
  buildType,
  resources,
  shrineRenown = 0,
}: {
  map: GameMap
  buildType?: string | null
  resources?: Resources
  shrineRenown?: number
}) {
  const balance = useBalanceStore((s) => s.balance)
  const hovered = useCameraStore((s) => s.hovered)
  if (!hovered) return null

  if (!tileAt(map, hovered.x, hovered.z)) return null

  const build = buildCatalog(balance).find((item) => item.id === buildType)
  if (build) {
    const valid =
      shrineRenown >= build.requiredRenown &&
      !placementError(map, build, hovered, balance) &&
      !!resources &&
      canAfford(resources, build.cost)
    const color = valid ? "#93bc6c" : "#db6656"
    return (
      <group
        position={[
          tileToWorldX(map, hovered.x) + (build.w - 1) / 2,
          0.24,
          tileToWorldZ(map, hovered.z) + (build.d - 1) / 2,
        ]}
      >
        <mesh renderOrder={4}>
          <boxGeometry args={[build.w, 0.04, build.d]} />
          <meshBasicMaterial color={color} transparent opacity={0.65} depthWrite={false} />
        </mesh>
        <mesh position={[0, build.height / 2, 0]} renderOrder={4}>
          <boxGeometry args={[build.w * 0.86, build.height, build.d * 0.86]} />
          <meshBasicMaterial color={color} wireframe transparent opacity={0.8} depthWrite={false} />
        </mesh>
      </group>
    )
  }

  const index = hovered.z * map.width + hovered.x
  // On a bridge the highlight rides the deck, not the water under it.
  const y = surfaceHeight(map, hovered.x, hovered.z)
  const flow = process.env.NODE_ENV !== "production" ? map.water?.flow[index] : undefined

  return (
    <group>
      <mesh position={[tileToWorldX(map, hovered.x), y + 0.015, tileToWorldZ(map, hovered.z)]}>
        <boxGeometry args={[1, 0.03, 1]} />
        <meshBasicMaterial color="#f2e8d5" transparent opacity={0.4} depthWrite={false} />
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
