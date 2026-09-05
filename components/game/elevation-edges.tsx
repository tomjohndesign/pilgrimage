"use client"

import { useEffect, useMemo } from "react"
import * as THREE from "three"
import { groundHeight } from "@/lib/game/map/elevation"
import { tileToWorldX, tileToWorldZ, type GameMap } from "@/lib/game/map/types"

/** Narrow rims follow exposed upper edges, leaving continuous slopes unmarked. */
export function ElevationEdges({ map }: { map: GameMap }) {
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
      for (const { dx, dz, a, b } of sides) {
        const nx = x + dx, nz = z + dz
        if (nx < 0 || nz < 0 || nx >= map.width || nz >= map.depth) continue
        const gap = (p: number[]) => groundHeight(map, x + p[0] * (dz ? 0.9999 : 1) - dx * 0.0001, z + p[1] * (dx ? 0.9999 : 1) - dz * 0.0001)
          - groundHeight(map, x + p[0] * (dz ? 0.9999 : 1) + dx * 0.0001, z + p[1] * (dx ? 0.9999 : 1) + dz * 0.0001)
        const ga = gap(a), gb = gap(b), cutoff = 0.06
        if (Math.max(ga, gb) <= cutoff) continue
        // A cliff can taper into a slope partway along an edge.
        const lo = ga < cutoff ? (cutoff - ga) / (gb - ga) : 0
        const hi = gb < cutoff ? (ga - cutoff) / (ga - gb) : 1
        const point = (t: number, inset: number) => {
          const px = a[0] + (b[0] - a[0]) * t - dx * inset
          const pz = a[1] + (b[1] - a[1]) * t - dz * inset
          return [tileToWorldX(map, x) + px, groundHeight(map, x + px * 0.9999, z + pz * 0.9999) + 0.012, tileToWorldZ(map, z) + pz]
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
  return <mesh name="elevation-rims" geometry={geometry} frustumCulled={false}>
    <meshBasicMaterial color="#342719" transparent opacity={map.elevation?.settings.edgeStrength ?? 0.7}
      depthWrite={false} side={THREE.DoubleSide} />
  </mesh>
}
