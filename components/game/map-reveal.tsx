"use client"

import { useEffect, useMemo, useRef } from "react"
import { useFrame } from "@react-three/fiber"
import * as THREE from "three"
import { usePopulationStore } from "@/lib/game/base-person/population-store"
import type { GameMap } from "@/lib/game/map/types"
import type { MapRevealPhase, MapRevealState } from "@/lib/game/render/map-reveal"
import { GAME_BACKGROUND } from "@/lib/game/render/background"
import { TileRevealMaterials } from "@/lib/game/render/map-reveal-material"
import { tileRevealFrame } from "@/lib/game/render/map-reveal-framing"

/** Fade whole tiles along a circular wave in world space. Authored geometry
 * keeps its 60° isometric edges, slopes, river banks and cliff faces.
 */
export function MapReveal({ map, state, onPhase, onProgress, onLandmarkReady, landmark = true }: {
  map: GameMap
  onLandmarkReady: () => void
  /** Spread from the founding church, or from the terrain under screen centre. */
  landmark?: boolean
  state: MapRevealState
  onPhase: (phase: MapRevealPhase) => void
  onProgress: (progress: number, reach: number) => void
}) {
  const lastReport = useRef<{ state: MapRevealState; phase: MapRevealPhase }>({ state, phase: "loading" })
  const reducedMotion = useRef(false)
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)")
    const update = () => { reducedMotion.current = media.matches }
    update()
    media.addEventListener("change", update)
    return () => media.removeEventListener("change", update)
  }, [])
  const materials = useMemo(() => new TileRevealMaterials({
    mapRevealExtent: { value: new THREE.Vector2() },
    mapRevealCentre: { value: new THREE.Vector2() },
    mapRevealProgress: { value: -1 },
    mapRevealReach: { value: 1 },
    mapRevealDirect: { value: false },
    mapRevealBackground: { value: new THREE.Color(GAME_BACKGROUND).convertLinearToSRGB() },
  }), [])
  const frame = useRef<ReturnType<typeof tileRevealFrame> | null>(null)
  const world = useRef(state)
  const landmarkFrames = useRef(0)
  useEffect(() => () => materials.dispose(), [materials])

  // All instance batches are written by .6; PixelCanvas renders at priority 1.
  useFrame(({ scene, camera }, delta) => {
    if (world.current !== state) {
      world.current = state
      frame.current = null
      landmarkFrames.current = 0
    }
    if (++landmarkFrames.current === 3) onLandmarkReady()
    scene.userData.mapRevealDirect = materials.uniforms.mapRevealDirect
    scene.userData.mapRevealActive = state.phase !== "complete"
    if (state.phase === "complete") return
    if (materials.prepare(scene) && state.phase === "loading") state.begin()()
    const phase = state.advance(delta, usePopulationStore.getState().building, reducedMotion.current)
    scene.userData.mapRevealActive = phase !== "complete"
    const uniforms = materials.uniforms
    uniforms.mapRevealExtent.value.set(map.width, map.depth)
    if (phase === "revealing") {
      frame.current ??= tileRevealFrame(map, camera, landmark)
      uniforms.mapRevealCentre.value.copy(frame.current.origin)
      uniforms.mapRevealReach.value = frame.current.radius
      uniforms.mapRevealProgress.value = state.progress * state.progress * (3 - 2 * state.progress)
      onProgress(uniforms.mapRevealProgress.value, frame.current.radius)
    } else {
      // Compile the scene while the church remains visible against the background.
      uniforms.mapRevealProgress.value = phase === "complete" ? 2 : -1
    }
    if (state !== lastReport.current.state || phase !== lastReport.current.phase) {
      lastReport.current = { state, phase }
      onPhase(phase)
    }
  }, .9)
  return null
}
