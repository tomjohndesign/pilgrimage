"use client"

import { useMemo, useRef, useState, type ComponentProps } from "react"
import { useFrame } from "@react-three/fiber"
import { footpathRoadSegments } from "@/lib/game/footpaths"
import { diagonalRoadSegments } from "@/lib/game/render/road-segments"
import { TerrainTiles } from "./terrain-tiles"

/** Sample mutable walking traffic twice a second without rerendering the character scene. */
export function WalkingTerrain(props: ComponentProps<typeof TerrainTiles>) {
  const { map } = props
  const [revision, setRevision] = useState(0)
  const elapsed = useRef(0)
  const foundingRoads = useMemo(() => diagonalRoadSegments(map), [map])
  useFrame((_, delta) => {
    elapsed.current += delta
    if (elapsed.current < .5) return
    elapsed.current = 0
    setRevision(map.footpaths?.revision ?? 0)
  })
  const traveledRoads = useMemo(() => {
    const segments = new Map(foundingRoads)
    if (map.footpaths) for (const [index, roads] of footpathRoadSegments(map, map.footpaths)) {
      segments.set(index, [...(segments.get(index) ?? []), ...roads])
    }
    return segments
  }, [map, foundingRoads, revision])
  return <TerrainTiles {...props} traveledRoads={traveledRoads} regrowRoads />
}
