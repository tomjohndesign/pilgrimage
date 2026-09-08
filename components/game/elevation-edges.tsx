"use client"

import { useEffect, useMemo, useRef } from "react"
import { useFrame } from "@react-three/fiber"
import * as THREE from "three"
import { sceneryDetail } from "@/lib/game/render/scenery-detail"
import { cliffCorner, terrainCorner, cliffUpperHeight } from "@/lib/game/map/cliff-corners"
import { SHORE_CORNERS, shorelineCorners } from "@/lib/game/map/shoreline"
import { TILE_HEIGHT } from "@/lib/game/map/terrain"
import { groundHeight } from "@/lib/game/map/elevation"
import { tileToWorldX, tileToWorldZ, type GameMap } from "@/lib/game/map/types"

/** Narrow rims follow exposed upper edges, leaving continuous slopes unmarked. */
export function ElevationEdges({ map }: { map: GameMap }) {
  const mesh = useRef<THREE.Mesh>(null)
  useFrame(({ scene }) => { if (mesh.current) mesh.current.visible = sceneryDetail(scene) === 0 })
  const width = map.elevation?.settings.edgeWidth ?? 0.045
  const geometry = useMemo(() => {
    const positions: number[] = []
    const sides = [
      { dx: 1, dz: 0, a: [0.5, -0.5], b: [0.5, 0.5] },
      { dx: -1, dz: 0, a: [-0.5, 0.5], b: [-0.5, -0.5] },
      { dx: 0, dz: 1, a: [0.5, 0.5], b: [-0.5, 0.5] },
      { dx: 0, dz: -1, a: [-0.5, -0.5], b: [0.5, -0.5] },
    ]
    for (let z = 0; z < map.depth; z++) for (let x = 0; x < map.width; x++) {
      if (map.water?.depth[z * map.width + x]) continue
      const cut = terrainCorner(map, x, z)
      const shore = shorelineCorners(map, x, z)
      if (cut && cliffCorner(map, x, z)) {
        const [dx, dz] = SHORE_CORNERS[cut.corner]
        const point = (end: number, inset: number) => {
          const px = dx * (.5 - end) - dx * inset / Math.SQRT2
          const pz = dz * (end - .5) - dz * inset / Math.SQRT2
          return [tileToWorldX(map, x) + px, TILE_HEIGHT + cliffUpperHeight(map, x, z, cut, px + .5, pz + .5) + .012, tileToWorldZ(map, z) + pz]
        }
        const p = [point(0, 0), point(1, 0), point(0, width), point(1, width)]
        for (const i of [0, 1, 2, 2, 1, 3]) positions.push(...p[i])
      }
      for (const { dx, dz, a, b } of sides) {
        // These two square edges now belong to the lower half. Drawing their
        // old upper rims would stretch triangles down the new diagonal wall.
        if (cut && (SHORE_CORNERS[cut.corner][0] === dx || SHORE_CORNERS[cut.corner][1] === dz)) continue
        const nx = x + dx, nz = z + dz
        if (nx < 0 || nz < 0 || nx >= map.width || nz >= map.depth) continue
        // A half-tile shoreline joins these square edges into one surface.
        // Its old bank rim would otherwise float across the replacement half.
        if (shore.some((flag, c) => flag && (SHORE_CORNERS[c][0] === dx || SHORE_CORNERS[c][1] === dz))) continue
        if (map.tiles[nz * map.width + nx] === "water" && shorelineCorners(map, nx, nz)
          .some((flag, c) => flag && (SHORE_CORNERS[c][0] === -dx || SHORE_CORNERS[c][1] === -dz))) continue
        const gap = (p: number[]) => groundHeight(map, x + p[0] * (dz ? 0.99 : 1) - dx * 0.0001, z + p[1] * (dx ? 0.99 : 1) - dz * 0.0001)
          - groundHeight(map, x + p[0] * (dz ? 0.99 : 1) + dx * 0.0001, z + p[1] * (dx ? 0.99 : 1) + dz * 0.0001)
        const ga = gap(a), gb = gap(b), cutoff = 0.06
        if (Math.max(ga, gb) <= cutoff) continue
        // A cliff can taper into a slope partway along an edge.
        const lo = ga < cutoff ? (cutoff - ga) / (gb - ga) : 0
        const hi = gb < cutoff ? (ga - cutoff) / (ga - gb) : 1
        const point = (t: number, inset: number) => {
          const px = a[0] + (b[0] - a[0]) * t - dx * inset
          const pz = a[1] + (b[1] - a[1]) * t - dz * inset
          const y = cut ? TILE_HEIGHT + cliffUpperHeight(map, x, z, cut, px + .5, pz + .5) : groundHeight(map, x + px * 0.9999, z + pz * 0.9999)
          return [tileToWorldX(map, x) + px, y + 0.012, tileToWorldZ(map, z) + pz]
        }
        const p = [point(lo, 0), point(hi, 0), point(lo, width), point(hi, width)]
        for (const i of [0, 1, 2, 2, 1, 3]) positions.push(...p[i])
      }
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3))
    return g
  }, [map, width])
  useEffect(() => () => geometry.dispose(), [geometry])
  return <mesh ref={mesh} name="elevation-rims" geometry={geometry} frustumCulled={false}>
    <meshBasicMaterial color="#342719" transparent opacity={map.elevation?.settings.edgeStrength ?? 0.7}
      depthWrite={false} side={THREE.DoubleSide} />
  </mesh>
}
