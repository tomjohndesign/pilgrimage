"use client"

import { useEffect } from "react"
import { useThree } from "@react-three/fiber"
import * as THREE from "three"

import { useCameraStore } from "@/lib/game/camera-store"
import type { GameMap } from "@/lib/game/map/types"
import type { OutlineMode } from "@/lib/game/render/outline"
import { simRegistry } from "@/lib/game/sim"
import type { EntState } from "@/lib/game/trees/ents"

import { outlineFrameRef } from "./outline-pass"
import { ROCKET_EXHAUST_NAME } from "./monk-rocket-gear"

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
      /** Live Ent state for checking staggered walks and replanting. */
      ents: () => {
        const ents: EntState[] = []
        scene.traverse((object) => {
          if (object.name === "ent-legs") ents.push(...object.userData.ents)
        })
        return ents
      },
      /** Monk positions and equipped boosters, for cheat-code smoke tests. */
      monks: () => {
        const points: Array<{ x: number; y: number; z: number; flying: boolean; equipped: boolean }> = []
        const position = new THREE.Vector3()
        scene.traverse((object) => {
          if (object.name !== "monk") return
          object.getWorldPosition(position)
          points.push({
            x: position.x, y: position.y, z: position.z,
            flying: !!object.parent?.getObjectByName(ROCKET_EXHAUST_NAME)?.visible,
            equipped: !!object.parent?.getObjectByName("monk-rocket-gear"),
          })
        })
        return points
      },
      /** Screen positions (client px) of traveler blocks, for e2e clicks. */
      travelerScreenPoints: () => {
        const rect = gl.domElement.getBoundingClientRect()
        const v = new THREE.Vector3()
        const points: Array<{ x: number; y: number }> = []
        scene.traverse((object) => {
          if (object.name !== "traveler") return
          object.getWorldPosition(v).project(camera)
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
