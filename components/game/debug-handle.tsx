"use client"

import { useEffect } from "react"
import { useThree } from "@react-three/fiber"
import * as THREE from "three"

import { useCameraStore } from "@/lib/game/camera-store"
import type { GameMap } from "@/lib/game/map/types"
import type { OutlineMode } from "@/lib/game/render/outline"
import { simRegistry } from "@/lib/game/sim"

import { outlineFrameRef } from "./outline-pass"

/**
 * Exposes a small handle on `window` so the scene can be driven deterministically
 * from Playwright or the console — set a camera pose, screenshot, compare.
 * (The world seed itself comes from the URL: /play?seed=….)
 * Development only; it is never mounted in a production build.
 */
export function DebugHandle({ map }: { map: GameMap }) {
  const { gl, camera, scene } = useThree()

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return

    const handle = {
      map,
      camera: () => useCameraStore.getState(),
      /** Jump straight to a pose. The rig still tweens toward it over a few frames. */
      setView: (viewIndex: number) =>
        useCameraStore.setState({ viewIndex: Math.round(viewIndex) }),
      setTarget: (x: number, z: number) => useCameraStore.setState({ targetX: x, targetZ: z }),
      setZoom: (viewSize: number) => useCameraStore.setState({ viewSize }),
      setOutline: (mode: OutlineMode) => useCameraStore.setState({ outlineMode: mode }),
      reset: () => useCameraStore.getState().reset(),
      /** Live traveler sim state (stats, activities), for e2e assertions. */
      sim: () => (simRegistry.current ? [...simRegistry.current.travelers.values()] : []),
      time: () => simRegistry.current?.time ?? null,
      setTerrainVisible: (visible: boolean) => { const terrain = scene.getObjectByName("terrain"); if (terrain) terrain.visible = visible },
      renderInfo: () => ({
        programs: gl.info.programs?.length ?? 0,
        spritePrograms: gl.info.programs?.filter((p) => p.cacheKey.includes("traveler-id")).length ?? 0,
        textures: gl.info.memory.textures,
      }),
      /** Sprite layout and active clip for comparing road character models. */
      travelerSprites: () => {
        const sprites: Array<{ model: string; phase: number; sync: boolean; fps: number; sheet: string; repeat: number[]; offset: number[]; center: number[]; scale: number[] }> = []
        scene.traverse((object) => {
          if (object.name !== "traveler" || !(object instanceof THREE.Sprite)) return
          const map = object.material.map
          const image = map?.image as HTMLImageElement | undefined
          sprites.push({ model: object.userData.characterModel, phase: object.userData.walkPhase, sync: object.userData.sync, fps: object.userData.fps, sheet: image?.src ?? "",
            repeat: map?.repeat.toArray() ?? [], offset: map?.offset.toArray() ?? [], center: object.center.toArray(), scale: object.scale.toArray() })
        })
        return sprites
      },
      travelerShadows: () => {
        const shadows: Array<{ visible: boolean; offset: number[]; depthWrite: boolean }> = []
        scene.traverse(object => {
          if (object.name === "traveler-shadow" && object instanceof THREE.Sprite) shadows.push({ visible: object.visible, offset: object.material.map?.offset.toArray() ?? [], depthWrite: object.material.depthWrite })
        })
        return shadows
      },
      setShadowsVisible: (visible: boolean) => scene.traverse(object => { if (object.name === "traveler-shadow") object.visible = visible }),
      /** Screen positions (client px) of traveler sprites, for e2e clicks. */
      travelerScreenPoints: () => {
        const rect = gl.domElement.getBoundingClientRect()
        const v = new THREE.Vector3()
        const points: Array<{ x: number; y: number }> = []
        scene.traverse((object) => {
          if (object.name !== "traveler") return
          object.getWorldPosition(v)
          v.y += 0.25
          v.project(camera)
          points.push({
            x: rect.left + ((v.x + 1) / 2) * rect.width,
            y: rect.top + ((1 - v.y) / 2) * rect.height,
          })
        })
        return points
      },
      /**
       * Data URL of the current frame. Renders first so the drawing buffer is
       * populated — without that, reading it back returns a blank image unless
       * the context was created with `preserveDrawingBuffer`.
       */
      screenshot: () => {
        // Prefer the outline pass's frame render so screenshots match the screen.
        if (outlineFrameRef.current) outlineFrameRef.current()
        else gl.render(scene, camera)
        return gl.domElement.toDataURL("image/png")
      },
    }

    ;(window as unknown as Record<string, unknown>).__pilgrimage = handle
    return () => {
      delete (window as unknown as Record<string, unknown>).__pilgrimage
    }
  }, [gl, camera, scene, map])

  return null
}
