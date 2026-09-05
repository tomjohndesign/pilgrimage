"use client"

import { Suspense, useMemo } from "react"

import { TerrainTiles } from "@/components/game/terrain-tiles"
import { TreeField, type TreePlacement } from "@/components/game/trees"
import { PreviewCanvas } from "@/components/preview-canvas"
import { parseAsciiMap } from "@/lib/game/map/prototype-map"
import { TILE_HEIGHT } from "@/lib/game/map/terrain"
import { tileToWorldX, tileToWorldZ } from "@/lib/game/map/types"
import { TREE_SPECIES_ORDER, type TreeSpeciesId } from "@/lib/game/trees/species"

/** A strip of clear land to stand the trees on. */
const STRIP = parseAsciiMap(["ooooooooo", "ooooooooo", "ooooooooo"])

/** How many individuals to show when studying one species. */
export const LINEUP_COUNT = 7

/**
 * A row of trees against the game's real ground and lighting. Pass a species
 * to see several individuals of it side by side — the variability of the
 * ranges — or "all" for one of each, to compare silhouettes.
 */
export function TreeLineup({
  species,
  seed,
  view = 0,
}: {
  species: TreeSpeciesId | "all"
  seed: number
  view?: number
}) {
  const placements = useMemo<TreePlacement[]>(() => {
    const ids = species === "all" ? TREE_SPECIES_ORDER : Array(LINEUP_COUNT).fill(species)
    const y = TILE_HEIGHT
    const z = tileToWorldZ(STRIP, 1)
    // Centre the row on the strip whatever its length.
    const start = (STRIP.width - ids.length) / 2
    return ids.map((id: TreeSpeciesId, index: number) => ({
      x: tileToWorldX(STRIP, start + index),
      y,
      z,
      species: id,
    }))
  }, [species])

  return (
    <PreviewCanvas zoom={72} view={view}>
      <group position={[0, -0.9, 0]}>
        <Suspense fallback={null}>
          <TerrainTiles map={STRIP} />
        </Suspense>
        <TreeField placements={placements} seed={seed} />
      </group>
    </PreviewCanvas>
  )
}
