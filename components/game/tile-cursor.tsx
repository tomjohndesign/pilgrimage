"use client"

import { StructureModel } from "@/components/building-lab/building-model"
import { placementBuildingLayout, placementSite } from "@/lib/game/building-placement-layout"
import { structureParts } from "@/lib/game/building-art/structure"

import { useMemo } from "react"
import { useBuildStore } from "@/lib/game/build-store"
import { buildingYaw, rotatedFootprint } from "@/lib/game/building-rotation"
import { PlacementEntrances } from "./placement-entrances"
import { groundHeight } from "@/lib/game/map/elevation"

import { canAfford, placementError, type Resources } from "@/lib/game/settlement"
import { useBalanceStore } from "@/lib/game/balance-store"
import { buildCatalog, type GameBalance } from "@/lib/game/balance"
import { useCameraStore } from "@/lib/game/camera-store"
import { surfaceHeight, ropeHeightAt } from "@/lib/game/map/bridges"
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
  balance: labBalance,
}: {
  map: GameMap
  buildType?: string | null
  resources?: Resources
  shrineRenown?: number
  /** Playgrounds validate against their own rules instead of the saved tuning. */
  balance?: GameBalance
}) {
  const savedBalance = useBalanceStore((s) => s.balance)
  const balance = labBalance ?? savedBalance
  const requestedRotation = useBuildStore((s) => s.rotation)
  const hovered = useCameraStore((s) => s.hovered)
  const highlight = useMemo(() => {
    if (!hovered) return new Float32Array(0)
    const centre = surfaceHeight(map, hovered.x, hovered.z)
    const onBridge = Math.abs(centre - groundHeight(map, hovered.x, hovered.z)) > 0.001
    return new Float32Array([[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]].flatMap(([x, z]) =>
      [x, onBridge ? (ropeHeightAt(map, hovered.x + x * 0.999, hovered.z + z * 0.999) ?? centre) - centre : groundHeight(map, hovered.x + x * 0.999, hovered.z + z * 0.999) - centre, z]))
  }, [map, hovered])
  const build = useMemo(() => buildCatalog(balance).find((item) => item.id === buildType && !item.retired), [balance, buildType])
  // An inn hovered over its tavern snaps onto the roof, so the ghost stands
  // where the click will actually build rather than under the cursor.
  const site=useMemo(()=>build && hovered ? placementSite(map,build,hovered,requestedRotation) : null,[map,build,hovered,requestedRotation])
  const rotation=site?.rotation ?? requestedRotation
  const {layoutSeed,hearthZ,fireplace,supportId,floorHeight,tavernFlue} = build && site ? placementBuildingLayout(map,{...build,...rotatedFootprint(build,rotation),...site,rotation,buildType:build.id,id:"construction-preview"}) : {}
  const parts = useMemo(() => build ? structureParts({ ...build, buildType: build.id, layoutSeed, hearthZ, fireplace, supportId, floorHeight, tavernFlue }) : [], [build, layoutSeed, hearthZ, fireplace, supportId, floorHeight, tavernFlue])
  if (!hovered) return null

  if (!tileAt(map, hovered.x, hovered.z)) return null

  if (build && site) {
    const footprint = rotatedFootprint(build, rotation)
    const valid =
      shrineRenown >= build.requiredRenown &&
      !placementError(map, build, site, balance, rotation) &&
      !!resources &&
      canAfford(resources, build.cost)
    const color = valid ? "#93bc6c" : "#db6656"
    return (
      <group
        position={[
          tileToWorldX(map, site.x) + (footprint.w - 1) / 2,
          groundHeight(map, site.x + (footprint.w - 1) / 2, site.z + (footprint.d - 1) / 2) + (floorHeight ?? 0),
          tileToWorldZ(map, site.z) + (footprint.d - 1) / 2,
        ]}
      >
        <mesh position={[0, 0.04, 0]} renderOrder={4}>
          <boxGeometry args={[footprint.w, 0.04, footprint.d]} />
          <meshBasicMaterial color={color} transparent opacity={0.65} depthWrite={false} />
        </mesh>
        <group rotation={[0, buildingYaw(rotation), 0]}>
          <StructureModel parts={parts} ghostColor={color} />
          {!supportId && <PlacementEntrances layoutSeed={layoutSeed} type={build.id} w={build.w} d={build.d} color={color} />}
        </group>
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
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[highlight, 3]} />
          <bufferAttribute attach="index" args={[new Uint16Array([0, 2, 1, 1, 2, 3]), 1]} />
        </bufferGeometry>
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
