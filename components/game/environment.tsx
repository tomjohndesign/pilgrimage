"use client"

import { useMemo } from "react"

import { environmentRadius } from "@/lib/game/environment/elements"
import { placeEnvironment } from "@/lib/game/environment/placement"
import type { GameMap } from "@/lib/game/map/types"
import { isGroundGrowth } from "@/lib/game/environment/sprites"
import { EnvironmentField } from "./environment-sprites"
export { EnvironmentField } from "./environment-sprites"

export function Environment({ map }: { map: GameMap }) {
  const placements = useMemo(() => placeEnvironment(map), [map])
  const buildings = map.buildings
  const visible = useMemo(() => placements.filter((p) => {
    if (isGroundGrowth(p.kind)) return false
    const radius = environmentRadius(p)
    const x = p.x + map.width / 2
    const z = p.z + map.depth / 2
    return !buildings.some((b) => x + radius > b.x && x - radius < b.x + b.w &&
      z + radius > b.z && z - radius < b.z + b.d)
  }), [placements, buildings, map.width, map.depth])
  return <EnvironmentField placements={visible} />
}
