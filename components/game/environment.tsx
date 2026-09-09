"use client"

import { useMemo } from "react"

import { environmentRadius } from "@/lib/game/environment/elements"
import { groundHeight } from "@/lib/game/map/elevation"
import { placeEnvironment } from "@/lib/game/environment/placement"
import type { GameMap } from "@/lib/game/map/types"
import { isGroundGrowth } from "@/lib/game/environment/sprites"
import { EnvironmentField } from "./environment-sprites"
export { EnvironmentField } from "./environment-sprites"

export function Environment({ map }: { map: GameMap }) {
  // A settlement changes the existing landscape; it does not seed new colonies
  // around every new footprint or construction stage.
  const placements = useMemo(() => placeEnvironment(map), [map.tiles, map.width, map.depth, map.seed, map.water, map.road, map.site])
  const buildings = map.buildings
  const visible = useMemo(() => placements.flatMap((p) => {
    if (isGroundGrowth(p.kind)) return []
    const radius = environmentRadius(p)
    const x = p.x + map.width / 2
    const z = p.z + map.depth / 2
    if (buildings.some((b) => x + radius > b.x - 1 && x - radius < b.x + b.w + 1 &&
      z + radius > b.z - 1 && z - radius < b.z + b.d + 1)) return []
    const y = groundHeight(map, x - .5, z - .5)
    return [Math.abs(y - p.y) < 1e-12 ? p : { ...p, y }]
  }), [placements, buildings, map.width, map.depth, map.elevation])
  return <EnvironmentField placements={visible} />
}
