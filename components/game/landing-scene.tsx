"use client"

import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { useFrame, useThree } from "@react-three/fiber"
import * as THREE from "three"
import { PixelCanvas, PixelCharacters, PixelWorld } from "@/components/pixel-canvas"
import { StructureModel } from "@/components/building-lab/building-model"
import { shrineStructureParts } from "@/lib/game/building-art/structure"
import { BASE_CHARACTER_SCALE } from "@/lib/game/base-person/gait"
import { monkVisual, monkWalkSpeed, MONK_WALK_TUNING } from "@/lib/game/base-person/monk-assets"
import { TILE_HEIGHT } from "@/lib/game/map/terrain"
import { TerrainTiles } from "./terrain-tiles"
import { cameraOffset, yawForView } from "@/lib/game/render/iso"
import { SURFACE_LIGHT } from "@/lib/game/render/lighting"
import { CameraLight } from "./camera-light"
import { CharacterSprite } from "./character-sprite"
import { LANDING_CHURCH, LANDING_TERRAIN, LANDING_TILES, LANDING_ROUTE_LENGTH, landingMonkPoint } from "@/lib/game/render/landing-layout"
import { isSelected, useCameraStore } from "@/lib/game/camera-store"
import { selectElement } from "@/lib/game/selection"
import { buildingObjectId, encodeObjectId } from "@/lib/game/render/outline"
import { OutlinePass } from "./outline-pass"
import { SceneAssetsContext } from "./scene-assets"
import { MapRevealState } from "@/lib/game/render/map-reveal"

function LandingCamera({ viewSize }: { viewSize: number }) {
  const { camera, size } = useThree()
  useLayoutEffect(() => {
    const cam = camera as THREE.OrthographicCamera
    cam.top = viewSize / 2; cam.bottom = -cam.top
    cam.right = cam.top * size.width / size.height; cam.left = -cam.right
    cam.position.set(...cameraOffset(yawForView(0)))
    cam.position.y += 1.15
    cam.lookAt(0, 1.15, 0)
    cam.updateProjectionMatrix(); cam.updateMatrixWorld()
  }, [camera, size, viewSize])
  return null
}

/** A hand-authored patch rendered by the same terrain component as the game. */
function LandingTiles() {
  const coverage = useMemo(() => {
    const data = new Uint8Array(LANDING_TERRAIN.width * LANDING_TERRAIN.depth * 4)
    for (const tile of LANDING_TILES) data[((tile.z + 5) * LANDING_TERRAIN.width + tile.x + 5) * 4] = Math.round(tile.opacity * 255)
    const texture = new THREE.DataTexture(data, LANDING_TERRAIN.width, LANDING_TERRAIN.depth)
    texture.needsUpdate = true
    return texture
  }, [])
  useEffect(() => () => coverage.dispose(), [coverage])
  return <group name="landing-tiles" position={[0, -TILE_HEIGHT, 0]}>
    <TerrainTiles map={LANDING_TERRAIN} tileCoverage={coverage} slab={false} showGrid traffic={12} />
  </group>
}

/** Decorative walkers use the same distance-driven rig and planted feet as live monks. */
function LandingMonk({ index }: { index: number }) {
  const group = useRef<THREE.Group>(null)
  const visual = useMemo(() => monkVisual(index === 1 ? 65 : 30), [index])
  const progress = useRef(index * LANDING_ROUTE_LENGTH / 3)
  const reduced = useRef(false)
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)")
    const update = () => { reduced.current = media.matches }
    update(); media.addEventListener("change", update)
    return () => media.removeEventListener("change", update)
  }, [])
  useFrame((_, delta) => {
    const root = group.current
    if (!root) return
    const distance = reduced.current || document.hidden ? 0 : monkWalkSpeed(BASE_CHARACTER_SCALE) * Math.min(delta, .05)
    progress.current += distance
    const { x, z, heading } = landingMonkPoint(progress.current)
    const traveled = root.userData.initialized ? Math.hypot(x - root.position.x, z - root.position.z) : 0
    root.position.set(x, 0, z)
    Object.assign(root.userData, { initialized: true, phase: index / 3, distance: traveled,
      heading, moving: distance > 0,
      playbackRate: reduced.current ? 0 : 1 })
  }, -1)
  return <group ref={group} name="landing-monk">
    <CharacterSprite type="friar" name="monk" visualOverride={visual} characterScale={BASE_CHARACTER_SCALE} walkTuning={MONK_WALK_TUNING} />
  </group>
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

/** A small scene of shared assets, with no generated terrain or settlement simulation. */
export function LandingScene({ viewSize, onReady }: { viewSize: number; onReady: () => void }) {
  const assets = useMemo(() => new MapRevealState(), [])
  const parts = useMemo(() => shrineStructureParts(LANDING_CHURCH.w, LANDING_CHURCH.d).filter(part => !part.surface), [])
  const selected = useCameraStore(state => isSelected(state.selection, { kind: "building", id: LANDING_CHURCH.id }))
  const [hovered, setHovered] = useState(false)
  const idColor = useMemo(() => new THREE.Color(...encodeObjectId(buildingObjectId(0))), [])
  const toggle = (event: { delta: number; stopPropagation: () => void }) => selectElement({ kind: "building", id: LANDING_CHURCH.id }, event)
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") useCameraStore.getState().select(null) }
    window.addEventListener("keydown", escape)
    return () => { window.removeEventListener("keydown", escape); useCameraStore.getState().select(null) }
  }, [])
  return <>
    <button type="button" className="landing-church-keyboard hud-action" aria-label="Inspect church" aria-pressed={selected}
      onClick={event => toggle({ delta: 0, stopPropagation: () => event.stopPropagation() })}>{selected ? "Close church interior" : "Inspect church"}</button>
    <PixelCanvas orthographic resize={{ offsetSize: true }} camera={{ manual: true, near: .1, far: 400 }} style={{ cursor: hovered ? "pointer" : "default" }} onPointerMissed={() => useCameraStore.getState().select(null)}>
    <LandingCamera viewSize={viewSize} />
    <ambientLight intensity={SURFACE_LIGHT.ambient} />
    <hemisphereLight args={[SURFACE_LIGHT.sky, SURFACE_LIGHT.ground, SURFACE_LIGHT.hemisphere]} />
    <CameraLight />
    <SceneAssetsContext.Provider value={assets}><Suspense fallback={null}>
      <PixelWorld><LandingTiles />
        <group onPointerOver={event => { event.stopPropagation(); setHovered(true) }} onPointerOut={() => setHovered(false)}>
          <StructureModel parts={parts} ink={false} idColor={idColor} cutaway={selected} onClick={toggle} />
        </group>
      </PixelWorld>
      <PixelCharacters>{[0, 1, 2].map(index => <LandingMonk key={index} index={index} />)}</PixelCharacters>
      <Ready assets={assets} onReady={onReady} />
    </Suspense></SceneAssetsContext.Provider>
    <OutlinePass objects={{ buildings: [LANDING_CHURCH], travelers: [], monks: [] }} />
  </PixelCanvas></>
}
