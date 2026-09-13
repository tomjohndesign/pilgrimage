"use client"

import { useEffect, useMemo } from "react"
import * as THREE from "three"
import { churchDevelopmentPlot } from "@/lib/game/shrine-upgrade"
import { getBuildInfluence } from "@/lib/game/build-influence"
import { useBalanceStore } from "@/lib/game/balance-store"
import type { GameBalance } from "@/lib/game/balance"
import { groundHeight } from "@/lib/game/map/elevation"
import { surfaceHeight, bridgeLayout, ropeHeightAt } from "@/lib/game/map/bridges"
import { tileToWorldX, tileToWorldZ, type GameMap } from "@/lib/game/map/types"
import { buildTileError } from "@/lib/game/settlement"

/**
 * A faint boundary of radiated influence outside build mode; while building,
 * show ground availability across the whole map without a territory boundary.
 * The cursor separately validates the selected footprint, supplies and camp access.
 * @see https://app.paper.design/file/01M1QTYBYHXP4H1BXFQ79N18AP/2-0
 */
export function BuildInfluenceOverlay({ map, buildMode, balance: labBalance }: { map: GameMap; buildMode: boolean; balance?: GameBalance }) {
  const savedBalance = useBalanceStore((s) => s.balance)
  const balance = labBalance ?? savedBalance
  const geometry = useMemo(() => {
    const field = getBuildInfluence(map, balance)
    const positions: number[] = [], colors: number[] = [], edges: number[] = [], churchEdges: number[] = []
    const church = churchDevelopmentPlot(map)
    const reserved = new THREE.Color("#e4c77f")
    const available = new THREE.Color("#93bc6c"), blocked = new THREE.Color("#db6656")
    for (let z = 0; z < map.depth; z++) {
      for (let x = 0; x < map.width; x++) {
        if (!buildMode && !field.radiated[z * map.width + x]) continue
        const wx = tileToWorldX(map, x), wz = tileToWorldZ(map, z)
        const onBridge = bridgeLayout(map).rise[z * map.width + x] > 0
        const y = (dx: number, dz: number) => (onBridge
          ? ropeHeightAt(map, x + dx * 0.999, z + dz * 0.999) ?? surfaceHeight(map, x, z)
          : groundHeight(map, x + dx * 0.999, z + dz * 0.999)) + 0.025
        const inChurchPlot = !!church && x >= church.x && x < church.x + church.w && z >= church.z && z < church.z + church.d
        const color = inChurchPlot ? reserved : buildTileError(map, x, z) ? blocked : available
        // Leave a narrow gap between tiles so the construction grid stays legible.
        for (const [dx, dz] of buildMode ? [[-.46, -.46], [-.46, .46], [.46, .46], [-.46, -.46], [.46, .46], [.46, -.46]] : []) {
          positions.push(wx + dx, y(dx, dz), wz + dz)
          colors.push(color.r, color.g, color.b)
        }
        for (const [dx, dz, ax, az, bx, bz] of [
          [-1, 0, -.5, -.5, -.5, .5], [1, 0, .5, -.5, .5, .5],
          [0, -1, -.5, -.5, .5, -.5], [0, 1, -.5, .5, .5, .5],
        ]) {
          const nx = x + dx, nz = z + dz
          if (buildMode && inChurchPlot && church && (nx < church.x || nx >= church.x + church.w || nz < church.z || nz >= church.z + church.d))
            churchEdges.push(wx + ax, y(ax, az) + .02, wz + az, wx + bx, y(bx, bz) + .02, wz + bz)
          if (!buildMode && (nx < 0 || nz < 0 || nx >= map.width || nz >= map.depth || !field.radiated[nz * map.width + nx]))
            edges.push(wx + ax, y(ax, az) + .015, wz + az, wx + bx, y(bx, bz) + .015, wz + bz)
        }
      }
    }
    const tiles = new THREE.BufferGeometry()
    tiles.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3))
    tiles.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3))
    const boundary = new THREE.BufferGeometry()
    boundary.setAttribute("position", new THREE.Float32BufferAttribute(edges, 3))
    const churchBoundary = new THREE.BufferGeometry()
    churchBoundary.setAttribute("position", new THREE.Float32BufferAttribute(churchEdges, 3))
    return { tiles, boundary, churchBoundary }
  }, [map, balance, buildMode])
  useEffect(() => () => { geometry.tiles.dispose(); geometry.boundary.dispose(); geometry.churchBoundary.dispose() }, [geometry])
  return (
    <group>
      <mesh geometry={geometry.tiles} visible={buildMode} renderOrder={2} raycast={() => {}}>
        <meshBasicMaterial vertexColors transparent opacity={0.28} depthWrite={false} />
      </mesh>
      <lineSegments geometry={geometry.churchBoundary} visible={buildMode} renderOrder={3} raycast={() => {}}>
        <lineBasicMaterial color="#e4c77f" transparent opacity={.95} depthWrite={false} />
      </lineSegments>
      <lineSegments geometry={geometry.boundary} visible={!buildMode} renderOrder={3} raycast={() => {}}>
        <lineBasicMaterial color="#e4c77f" transparent opacity={0.25} depthWrite={false} />
      </lineSegments>
    </group>
  )
}
