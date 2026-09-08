"use client"

import { startTransition, useMemo, useState, type ComponentProps } from "react"
import { useFrame } from "@react-three/fiber"
import { buildFootpathRoadSegments } from "@/lib/game/footpaths"
import { diagonalRoadSegments, type RoadSegment } from "@/lib/game/render/road-segments"
import { frameProfile } from "@/lib/game/render/frame-profile"
import { useBuildStore } from "@/lib/game/build-store"
import { TerrainTiles } from "./terrain-tiles"

type Props = ComponentProps<typeof TerrainTiles>
type Roads = Map<number, readonly RoadSegment[]>

function* snapshot(map: Props["map"], founding: Roads): Generator<void, Roads> {
  const walked = map.footpaths ? yield* buildFootpathRoadSegments(map, map.footpaths) : new Map()
  const roads = new Map(founding)
  let processed = 0
  for (const [index, segments] of walked) {
    roads.set(index, [...(roads.get(index) ?? []), ...segments])
    if (++processed % 128 === 0) yield
  }
  return roads
}

/** Road appearance follows live traffic in small slices. Walking and path
 * decisions stay synchronous; publishing a visual snapshot can yield to input. */
export function WalkingTerrain(props: Props) {
  const { map } = props
  const felledTrees = useBuildStore(s => s.felled)
  const founding = useMemo(() => diagonalRoadSegments(map), [map])
  const [published, publish] = useState<{ map: Props["map"]; roads: Roads }>()
  const work = useMemo(() => ({ elapsed: .5, revision: -1,
    pending: null as Generator<void, Roads> | null }), [map, founding])
  useFrame((_, delta) => {
    work.elapsed += delta
    const revision = map.footpaths?.revision ?? 0
    if (!work.pending && work.elapsed >= .5 && work.revision !== revision) {
      work.elapsed = 0
      work.revision = revision
      work.pending = snapshot(map, founding)
    }
    if (!work.pending) return
    const started = frameProfile.start(), deadline = performance.now() + 1
    do {
      const next = work.pending.next()
      if (next.done) {
        work.pending = null
        startTransition(() => publish({ map, roads: next.value }))
        break
      }
    } while (performance.now() < deadline)
    frameProfile.end("footpathSlice", started)
  })
  return <TerrainTiles {...props} felledTrees={felledTrees} traveledRoads={published?.map === map ? published.roads : founding} regrowRoads />
}
