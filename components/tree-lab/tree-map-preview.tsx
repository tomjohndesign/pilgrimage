"use client"

import { SURFACE_LIGHT } from "@/lib/game/render/lighting"

import { Suspense, useEffect, useMemo } from "react"
import { PixelCanvas, type PixelationProps } from "@/components/pixel-canvas"

import { CameraLight } from "@/components/game/camera-light"
import { CameraRig } from "@/components/game/camera-rig"
import { Environment } from "@/components/game/environment"
import { OutlinePass } from "@/components/game/outline-pass"
import { TerrainTiles } from "@/components/game/terrain-tiles"
import { FoliageField } from "./foliage-field"
import type { FoliageAtlas } from "@/lib/game/trees/foliage/design"
import { TREE_SPECIES } from "@/lib/game/trees/species"
import { placeTrees } from "@/lib/game/trees/placement"
import { Trees } from "@/components/game/trees"
import { useCameraStore } from "@/lib/game/camera-store"
import { generateMap } from "@/lib/game/map/generate-map"
import { CAM_FAR, CAM_NEAR } from "@/lib/game/render/iso"

/**
 * The game's terrain and trees on a generated map, with the game's own camera
 * rig, lights and outline pass — but none of the simulation (no relic, monks
 * or travelers), so species tuning can be judged against the forest as a whole
 * without the lab depending on world state. Same controls as /play: drag to
 * pan, scroll to zoom, Q/E to rotate, O to cycle outlines.
 */
export function TreeMapPreview({ seed, size, atlas, ...pixelation }: { seed: number; size: number; atlas?: FoliageAtlas } & PixelationProps) {
  const map = useMemo(() => generateMap({ seed, width: size, depth: size }), [seed, size])

  const prototype = !!atlas
  const placements = useMemo(() => placeTrees(map, prototype ? Object.fromEntries(Object.entries(TREE_SPECIES).map(([id, def]) => [id, {
    ...def, habitat: { ...def.habitat, weight: def.habitat.weight,
      footprint: id === "oak" || id === "beech" ? 0.85 : id === "hawthorn" || id === "holly" ? 0.45 : 0.6, perTile: 1 },
  }])) as typeof TREE_SPECIES : TREE_SPECIES), [map, prototype])
  useEffect(() => {
    if (!prototype) return
    const { outlineMode, selection } = useCameraStore.getState()
    useCameraStore.setState({ outlineMode: "off", selection: null })
    return () => { useCameraStore.setState({ outlineMode, selection }) }
  }, [prototype])

  useEffect(() => {
    const store = useCameraStore.getState()
    store.setMapSize(map.width, map.depth)
    store.reset()
  }, [map])

  return (
    <PixelCanvas
      {...pixelation}
      orthographic
      camera={{ manual: true, position: [20, 20, 20], near: CAM_NEAR, far: CAM_FAR }}
    >
      <color attach="background" args={["#14100a"]} />
      <ambientLight intensity={SURFACE_LIGHT.ambient} />
      <hemisphereLight args={[SURFACE_LIGHT.sky, SURFACE_LIGHT.ground, SURFACE_LIGHT.hemisphere]} />
      <CameraLight />

      <Suspense fallback={null}>
        <TerrainTiles map={map} />
      </Suspense>
      <Suspense fallback={null}>{atlas ? <FoliageField atlas={atlas} placements={placements} seed={seed} onSelect={id => useCameraStore.getState().select({ kind: "tree", id })} /> : <Trees map={map} />}</Suspense>
      <Environment map={map} />

      <CameraRig map={map} />
      <OutlinePass objects={atlas ? { buildings: [], travelers: [], monks: [] } : undefined} />
    </PixelCanvas>
  )
}
