"use client"

import { useEffect, type RefObject } from "react"
import { create } from "zustand"

/** Native pixel magnification is shared by characters and animals. */
export const useAssetPreviewStore = create<{ zoom: number; setZoom: (zoom: number) => void }>(set => ({ zoom: 6, setZoom: zoom => set({ zoom }) }))
export const ASSET_ZOOMS = [1, 2, 4, 6, 8, 12]

export function usePreviewWheel(ref: RefObject<HTMLElement | null>, enabled = true) {
  useEffect(() => {
    const element = ref.current
    if (!element || !enabled) return
    const wheel = (event: WheelEvent) => {
      event.preventDefault()
      const { zoom, setZoom } = useAssetPreviewStore.getState()
      const next = event.deltaY < 0 ? ASSET_ZOOMS.find(value => value > zoom) : [...ASSET_ZOOMS].reverse().find(value => value < zoom)
      if (next !== undefined) setZoom(next)
    }
    element.addEventListener("wheel", wheel, { passive: false })
    return () => element.removeEventListener("wheel", wheel)
  }, [ref, enabled])
}
