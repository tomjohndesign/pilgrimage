"use client"

import { useEffect, type RefObject } from "react"
import { wheelZoomFactor } from "@/lib/game/render/camera-input"
import { create } from "zustand"

/** Native pixel magnification is shared by characters and animals. */
export const useAssetPreviewStore = create<{ zoom: number; setZoom: (zoom: number) => void }>(set => ({ zoom: 6, setZoom: zoom => set({ zoom }) }))

export function usePreviewWheel(ref: RefObject<HTMLElement | null>, enabled = true) {
  useEffect(() => {
    const element = ref.current
    if (!element || !enabled) return
    const wheel = (event: WheelEvent) => {
      event.preventDefault()
      const { zoom, setZoom } = useAssetPreviewStore.getState()
      setZoom(Math.max(1, Math.min(24, zoom / wheelZoomFactor(event.deltaY, event.deltaMode))))
    }
    element.addEventListener("wheel", wheel, { passive: false })
    return () => element.removeEventListener("wheel", wheel)
  }, [ref, enabled])
}
