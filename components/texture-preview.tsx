"use client"

import { Suspense } from "react"

import { parseAsciiMap } from "@/lib/game/map/prototype-map"
import type { TextureEntry } from "@/lib/game/render/textures"

import { TerrainTiles } from "./game/terrain-tiles"
import { PreviewCanvas } from "./preview-canvas"

/**
 * A slice of world for the map-edge preview: grass, a road, a patch of bare
 * earth — enough terrain variety to show the dirt cliff under a real map top.
 */
const MAP_EDGE_MAP = parseAsciiMap([
  "......",
  "......",
  "======",
  "..,,..",
  "..,,..",
  "......",
])

/**
 * How each `TexturePreviewKind` looks in game. Rendered with the same
 * components, lights, and camera maths as /play — this is the item itself,
 * not an approximation. Scenes are lifted so their visual centre sits at the
 * origin the iso camera studies.
 */
function PreviewScene({ kind }: { kind: TextureEntry["preview"] }) {
  switch (kind) {
    case "map-edge":
      return (
        <group position={[0, 1.4, 0]}>
          <Suspense fallback={null}>
            <TerrainTiles map={MAP_EDGE_MAP} />
          </Suspense>
        </group>
      )
  }
}

export function TexturePreview({ entry }: { entry: TextureEntry }) {
  return (
    <PreviewCanvas zoom={34}>
      <PreviewScene kind={entry.preview} />
    </PreviewCanvas>
  )
}
