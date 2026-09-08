"use client"

import { Suspense } from "react"

import { DEFAULT_ELEVATION } from "@/lib/game/map/elevation"
import { parseAsciiMap } from "@/lib/game/map/prototype-map"
import { tileToWorldX, tileToWorldZ } from "@/lib/game/map/types"
import type { TreePlacement } from "@/lib/game/trees/placement"
import type { TextureEntry } from "@/lib/game/render/textures"

import { TerrainTiles } from "./game/terrain-tiles"
import { PreviewCanvas } from "./preview-canvas"

/** Raised ground meeting a lower pool exposes the diagonal cliff corner faces. */
const MAP_EDGE_MAP = parseAsciiMap([
  "......", "......", "..,,..", "..,~~~", "...~~~", "..~~~~",
])
const edgeHeights = MAP_EDGE_MAP.tiles.map(t => t === "water" ? 0 : .9)
MAP_EDGE_MAP.elevation = {
  settings: { ...DEFAULT_ELEVATION }, height: edgeHeights,
  corners: edgeHeights.flatMap(h => [h, h, h, h]),
  slope: edgeHeights.map(() => 0), cliffs: edgeHeights.map(() => 0),
}

/**
 * For the road previews: the road runs past forest on one side and bare earth
 * on the other, so every kind of surroundings-weathering shows — mossy under
 * the trees, grass-fringed in the open, dusty by the dirt.
 */
const ROAD_MAP = parseAsciiMap([
  ".FF...",
  "FFF...",
  "======",
  "...,,.",
  "..,,,.",
  "......",
])

/**
 * For the grass preview: open meadow with the trail crossing it, so the sward
 * shows both on its own tiles and creeping back over the road.
 */
const GRASS_MAP = parseAsciiMap([
  "......",
  "......",
  "===...",
  "..====",
  "......",
  "......",
])

const GROUND_MAP = parseAsciiMap([
  "..^^..", "..^^..", ",,,,..", ",,,,%%", "...%%%", "...~~~",
])
const WATER_MAP = parseAsciiMap([
  "......", "..%%..", ".%~~%.", "%~~~~%", "~~~~~~", "~~~~~~",
])
WATER_MAP.water = {
  depth: ["000000", "000000", "001100", "012210", "122321", "123331"].flatMap(row => [...row].map(Number)),
  flow: {},
}
const FOREST_MAP = parseAsciiMap([
  "......", ".FFFF.", ".FFFF.", ".FFFF.", ".FFFF.", "......",
])
const FOREST_TREES: TreePlacement[] = FOREST_MAP.tiles.flatMap((t, i) => t === "forest"
  ? [{ x: tileToWorldX(FOREST_MAP, i % FOREST_MAP.width), y: .2, z: tileToWorldZ(FOREST_MAP, Math.floor(i / FOREST_MAP.width)), species: "oak" }] : [])
const SAND_MAP = parseAsciiMap([
  "......", "...%..", "..%%..", ".%%%%.", "%%%~~~", "~~~~~~",
])

/**
 * How each `TexturePreviewKind` looks in game. Rendered with the same
 * components, lights, and camera maths as /play — this is the item itself,
 * not an approximation. Scenes are lifted so their visual centre sits at the
 * origin the iso camera studies.
 */
function PreviewScene({ entry }: { entry: TextureEntry }) {
  switch (entry.preview) {
    case "map-edge":
      return (
        <group position={[0, 1.4, 0]}>
          <Suspense fallback={null}>
            <TerrainTiles map={MAP_EDGE_MAP} />
          </Suspense>
        </group>
      )
    case "road":
      return (
        <group position={[0, 1.4, 0]}>
          <Suspense fallback={null}>
            <TerrainTiles map={ROAD_MAP} roadTier={entry.roadTier} />
          </Suspense>
        </group>
      )
    case "forest":
      return <group position={[0, 1.4, 0]}><TerrainTiles map={FOREST_MAP} trees={FOREST_TREES} /></group>
    case "ground":
    case "water":
    case "sand":
      return (
        <group position={[0, 1.4, 0]}>
          <TerrainTiles map={entry.preview === "water" ? WATER_MAP : entry.preview === "sand" ? SAND_MAP : GROUND_MAP} />
        </group>
      )
    case "grass":
      return (
        <group position={[0, 1.4, 0]}>
          <Suspense fallback={null}>
            <TerrainTiles map={GRASS_MAP} roadTier={0} />
          </Suspense>
        </group>
      )
  }
}

export function TexturePreview({ entry }: { entry: TextureEntry }) {
  return (
    <PreviewCanvas zoom={34}>
      <PreviewScene entry={entry} />
    </PreviewCanvas>
  )
}
