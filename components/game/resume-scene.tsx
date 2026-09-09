"use client"

import { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from "react"
import { useFrame, useThree } from "@react-three/fiber"
import * as THREE from "three"
import { PixelCanvas, PixelWorld } from "@/components/pixel-canvas"
import { EnvironmentField } from "./environment-sprites"
import { FoliageField } from "./foliage-field"
import { OutlinePass } from "./outline-pass"
import { SceneAssetsContext } from "./scene-assets"
import { TerrainTiles } from "./terrain-tiles"
import { CameraLight } from "./camera-light"
import { cameraOffset, yawForView } from "@/lib/game/render/iso"
import { SURFACE_LIGHT } from "@/lib/game/render/lighting"
import { MapRevealState } from "@/lib/game/render/map-reveal"
import { deriveSeed, SEED_STREAM } from "@/lib/game/rng"
import type { SurroundingsSave } from "@/lib/game/save/schema"
import { surroundingsCoverage, surroundingsMap, surroundingsScenery, surroundingsTrees } from "@/lib/game/save/surroundings"
import { DEFAULT_FOLIAGE_ATLAS } from "@/lib/game/trees/foliage/assets"

/** The saved camera, looking at the ground under its focus, at the saved zoom. */
function ResumeCamera({ viewIndex, viewSize }: { viewIndex: number; viewSize: number }) {
  const { camera, size } = useThree()
  useLayoutEffect(() => {
    const cam = camera as THREE.OrthographicCamera
    cam.top = viewSize / 2; cam.bottom = -cam.top
    cam.right = cam.top * size.width / size.height; cam.left = -cam.right
    cam.position.set(...cameraOffset(yawForView(viewIndex)))
    cam.lookAt(0, 0, 0)
    cam.updateProjectionMatrix(); cam.updateMatrixWorld()
  }, [camera, size, viewIndex, viewSize])
  return null
}

function Ready({ assets, onReady }: { assets: MapRevealState; onReady: () => void }) {
  const ready = useRef(false)
  useFrame(() => {
    if (!ready.current && assets.advance(0, false, true) === "complete") {
      ready.current = true
      onReady()
    }
  })
  return null
}

/**
 * The remembered land around the player's last view, drawn by the same
 * terrain, tree and scenery renderers as the game while the real world
 * regenerates behind it. Its origin is the camera focus, so it sits exactly
 * where the world will appear, and its ground fades out in the same disc as
 * the landing church's.
 */
export function ResumeScene({ patch, viewIndex, viewSize, onReady }: {
  patch: SurroundingsSave
  viewIndex: number
  viewSize: number
  onReady: () => void
}) {
  const assets = useMemo(() => new MapRevealState(), [])
  const map = useMemo(() => surroundingsMap(patch), [patch])
  const trees = useMemo(() => surroundingsTrees(patch), [patch])
  const scenery = useMemo(() => surroundingsScenery(patch), [patch])
  const coverage = useMemo(() => {
    const texture = new THREE.DataTexture(surroundingsCoverage(patch), map.width, map.depth)
    texture.needsUpdate = true
    return texture
  }, [patch, map.width, map.depth])
  useEffect(() => () => coverage.dispose(), [coverage])
  return <PixelCanvas orthographic resize={{ offsetSize: true }} camera={{ manual: true, near: .1, far: 400 }}>
    <ResumeCamera viewIndex={viewIndex} viewSize={viewSize} />
    <ambientLight intensity={SURFACE_LIGHT.ambient} />
    <hemisphereLight args={[SURFACE_LIGHT.sky, SURFACE_LIGHT.ground, SURFACE_LIGHT.hemisphere]} />
    <CameraLight />
    <SceneAssetsContext.Provider value={assets}><Suspense fallback={null}>
      <PixelWorld>
        {/* The centre tile's middle is the patch origin; shift so it sits at the focus. */}
        <group name="resume-land" position={[patch.offsetX, 0, patch.offsetZ]}>
          <TerrainTiles map={map} tileCoverage={coverage} slab={false} showGrid traffic={12} trees={trees} />
          <FoliageField atlas={DEFAULT_FOLIAGE_ATLAS} placements={trees} seed={deriveSeed(0, SEED_STREAM.treeShapes)} />
          <EnvironmentField placements={scenery} />
        </group>
      </PixelWorld>
      <Ready assets={assets} onReady={onReady} />
    </Suspense></SceneAssetsContext.Provider>
    <OutlinePass objects={{ buildings: [], travelers: [], monks: [] }} />
  </PixelCanvas>
}
