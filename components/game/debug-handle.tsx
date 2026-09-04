"use client"

import { useEffect } from "react"
import { useThree } from "@react-three/fiber"

import { useCameraStore } from "@/lib/game/camera-store"
import { PROTOTYPE_MAP } from "@/lib/game/map/prototype-map"
import type { OutlineMode } from "@/lib/game/render/outline"

import { outlineFrameRef } from "./outline-pass"

/**
 * Exposes a small handle on `window` so the scene can be driven deterministically
 * from Playwright or the console — set a camera pose, screenshot, compare.
 * Development only; it is never mounted in a production build.
 */
export function DebugHandle() {
  const { gl, camera, scene } = useThree()

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return

    const handle = {
      map: PROTOTYPE_MAP,
      camera: () => useCameraStore.getState(),
      /** Jump straight to a pose. The rig still tweens toward it over a few frames. */
      setView: (viewIndex: number) =>
        useCameraStore.setState({ viewIndex: Math.round(viewIndex) }),
      setTarget: (x: number, z: number) => useCameraStore.setState({ targetX: x, targetZ: z }),
      setZoom: (viewSize: number) => useCameraStore.setState({ viewSize }),
      setOutline: (mode: OutlineMode) => useCameraStore.setState({ outlineMode: mode }),
      setSeed: (seed: number) => useCameraStore.getState().setSeed(seed),
      reset: () => useCameraStore.getState().reset(),
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
  }, [gl, camera, scene])

  return null
}
