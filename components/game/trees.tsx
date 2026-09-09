"use client"

import { SceneAssetBoundary } from "./scene-assets"

import { lazy, useCallback, useEffect, useMemo } from "react"
import { BASE_CHARACTER_SCALE } from "@/lib/game/base-person/gait"
import { useCameraStore } from "@/lib/game/camera-store"
import { selectElement } from "@/lib/game/selection"
import { useBuildStore } from "@/lib/game/build-store"
import { deriveSeed, SEED_STREAM } from "@/lib/game/rng"
import type { GameMap } from "@/lib/game/map/types"
import { treeObjectId } from "@/lib/game/render/outline"
import { placeTrees, type TreePlacement } from "@/lib/game/trees/placement"
import { useTreeTuningStore } from "@/lib/game/trees/tree-tuning-store"
import { DEFAULT_FOLIAGE_ATLAS } from "@/lib/game/trees/foliage/assets"
import { foliageSpacing } from "@/lib/game/trees/foliage/spacing"
import { DEFAULT_TREE_MODEL, treeModelForGame, type TreeModel } from "@/lib/game/trees/render-model"
import { FoliageField } from "./foliage-field"
import { TreeRemains } from "./tree-remains"

export type { TreePlacement }
const ProceduralTreeBenchmark = process.env.NEXT_PUBLIC_GAME_BENCHMARK === "1"
  ? lazy(() => import("./procedural-tree-benchmark").then(m => ({ default: m.TreeField }))) : null

/** The game uses depth sprites; the legacy renderer is isolated to benchmark builds. */
export function Trees({ map, placements: supplied, ents = false, characterScale = BASE_CHARACTER_SCALE, model: requestedModel = DEFAULT_TREE_MODEL }: {
  map: GameMap; placements?: TreePlacement[]; ents?: boolean; characterScale?: number
  /** Sprites draw the baked pixel foliage in place of the parametric trees; Ents stay rooted. */
  model?: TreeModel
}) {
  const model = treeModelForGame(requestedModel)
  const selection = useCameraStore((s) => s.selection)
  const resources = useBuildStore((s) => s.treeResources)
  const time = useBuildStore((s) => s.time)
  const felled = useBuildStore((s) => s.felled)
  const species = useTreeTuningStore((s) => s.species)
  const placements = useMemo(() => supplied ?? placeTrees(map, model === "sprites" ? foliageSpacing(species) : species), [map, species, supplied, model])

  // Both renderers retain the original placement indices for picking and felling.
  const proceduralHidden = useMemo(() => new Set([...felled,
    ...placements.flatMap((tree, i) => tree.oldGrowth ? [i] : []),
  ]), [felled, placements])

  const selected = selection?.kind === "tree" ? placements[selection.id] : null
  const resource = selection?.kind === "tree" ? resources.get(selection.id) : null
  const visible = !resource || resource.health > 0 || resource.remainingWood > 0 || time < (resource.stumpUntil ?? 0)
  useEffect(() => {
    if (selection?.kind === "tree" && (!selected || !visible)) useCameraStore.getState().select(null)
  }, [selection, selected, visible])
  // `time` ticks several times a second, so this component re-renders often.
  // A stable handler is what lets the memoised blocks below skip that entirely.
  const selectTree = useCallback((id: number, event: { delta: number; stopPropagation: () => void }) => selectElement({ kind: "tree", id }, event), [])
  const seed = deriveSeed(map.seed ?? 0, SEED_STREAM.treeShapes)
  return (
    <group>
      {model === "sprites"
        ? <SceneAssetBoundary>
            <FoliageField atlas={DEFAULT_FOLIAGE_ATLAS} placements={placements} hidden={felled} onSelect={selectTree} seed={seed} idBase={map.buildings.length} />
          </SceneAssetBoundary>
        : <>
            {ProceduralTreeBenchmark && <SceneAssetBoundary><ProceduralTreeBenchmark placements={placements} hidden={proceduralHidden} onSelect={selectTree} entMap={ents ? map : undefined} seed={seed} idBase={map.buildings.length} /></SceneAssetBoundary>}
            <SceneAssetBoundary>
              <FoliageField atlas={DEFAULT_FOLIAGE_ATLAS} placements={placements} hidden={felled} oldGrowthOnly onSelect={selectTree} seed={seed} idBase={map.buildings.length} />
            </SceneAssetBoundary>
          </>}
      {Array.from(resources, ([id, resource]) => resource.health <= 0 && placements[id]
        ? <TreeRemains key={id} id={id} objectId={treeObjectId(map.buildings.length, id)} tree={placements[id]} resource={resource} time={time} characterScale={characterScale} /> : null)}
    </group>
  )
}
