"use client"

import { Suspense, useMemo } from "react"

import { FoliageField, type FoliagePlacement } from "@/components/game/foliage-field"
import { FOLIAGE_SPECIES, isFoliageSpecies, type FoliageAtlas } from "@/lib/game/trees/foliage/design"
import { PixelCharacters } from "@/components/pixel-canvas"
import { CharacterSprite } from "@/components/game/character-sprite"
import { monkVisual } from "@/lib/game/base-person/monk-assets"
import { yawForView } from "@/lib/game/render/iso"
import { TerrainTiles } from "@/components/game/terrain-tiles"
import { DARK_BRIGHTNESS } from "@/lib/game/trees/placement"
import { PreviewCanvas } from "@/components/preview-canvas"
import { parseAsciiMap } from "@/lib/game/map/prototype-map"
import { TILE_HEIGHT } from "@/lib/game/map/terrain"
import type { TreeSpeciesId } from "@/lib/game/trees/species"

const FOLIAGE_GROUND = parseAsciiMap(Array(13).fill("ooooooooooooo"))
const DARK_FOLIAGE_GROUND = parseAsciiMap(Array(13).fill("DDDDDDDDDDDDD"))

/**
 * A row of trees against the game's real ground and lighting. Pass a species
 * to see several individuals of it side by side — the variability of the
 * ranges — or "all" for one of each, to compare silhouettes.
 */
export function TreeLineup({
  species,
  seed,
  view = 0,
  atlas,
  darkForest = false,
  speciesPage = 0,
}: {
  species: TreeSpeciesId | "all"
  seed: number
  view?: number
  atlas: FoliageAtlas
  darkForest?: boolean
  speciesPage?: number
}) {
  const placements = useMemo<FoliagePlacement[]>(() => {
    const ids = species !== "all" && isFoliageSpecies(species) ? [species, species, species] : FOLIAGE_SPECIES.slice(speciesPage * 3, speciesPage * 3 + 3)
    const yaw = yawForView(view)
    return ids.map((id, index) => ({ x: (index - 1) * 3 * Math.cos(yaw), y: TILE_HEIGHT, z: -(index - 1) * 3 * Math.sin(yaw), species: id, foliageVariant: index, oldGrowth: darkForest, brightness: darkForest ? DARK_BRIGHTNESS : 1 }))
  }, [species, view, darkForest, speciesPage])

  return (
    <PreviewCanvas zoom={darkForest ? 80 : 90} view={view}>
      <group position={[0, darkForest ? -1.7 : -1.2, 0]}>
        <Suspense fallback={null}>
          <TerrainTiles map={darkForest ? DARK_FOLIAGE_GROUND : FOLIAGE_GROUND} />
        </Suspense>
        <Suspense fallback={null}>
          <>
            <FoliageField placements={placements} seed={seed} atlas={atlas} />
            <PixelCharacters>{placements.map((tree, i) => <group key={i} position={[tree.x + 1.1 * Math.cos(yawForView(view)), tree.y, tree.z - 1.1 * Math.sin(yawForView(view))]}>
              <CharacterSprite type="friar" name="monk" characterModel="base" characterScale={1.5} visualOverride={monkVisual(30)} />
            </group>)}</PixelCharacters>
          </>
        </Suspense>
      </group>
    </PreviewCanvas>
  )
}
