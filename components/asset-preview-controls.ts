"use client"

import { useEffect, useRef, type RefObject } from "react"
import { wheelZoomFactor } from "@/lib/game/render/camera-input"
import { create } from "zustand"

/** Native pixel magnification is shared by characters and animals. */
export const useAssetPreviewStore = create<{ zoom: number; setZoom: (zoom: number) => void }>(set => ({ zoom: 6, setZoom: zoom => set({ zoom }) }))

type Point = [number, number]
type PreviewGestures = {
  zoom: number; offset: Point; onZoom: (zoom: number) => void; onPan: (offset: Point) => void
  enabled?: boolean; minZoom?: number; maxZoom?: number; onTap?: (target: Element) => void
}
const INTERACTIVE = 'button, [role="button"], [role="slider"], input, select, textarea, a'

/** Shared flat-canvas gestures. A pinch keeps its ground point under the fingers. */
export function usePreviewGestures(ref: RefObject<HTMLElement | null>, options: PreviewGestures) {
  const live = useRef(options); live.current = options
  const enabled = options.enabled !== false
  useEffect(() => {
    const element = ref.current
    if (!element || !enabled) return
    const pointers = new Map<number, Point>()
    let origin: Point = [0, 0], offset: Point = [0, 0], moved = false, tapped: Element | null = null
    const clamp = (zoom: number) => Math.max(live.current.minZoom ?? 1, Math.min(live.current.maxZoom ?? 24, zoom))
    const pan = (value: Point) => { live.current = { ...live.current, offset: value }; live.current.onPan(value) }
    const zoom = (value: number) => { live.current = { ...live.current, zoom: value }; live.current.onZoom(value) }
    const midpoint = (points: Point[]): Point => [(points[0][0] + points[1][0]) / 2, (points[0][1] + points[1][1]) / 2]
    const distance = (points: Point[]) => Math.hypot(points[0][0] - points[1][0], points[0][1] - points[1][1])
    const wheel = (event: WheelEvent) => {
      if ((event.target as Element).closest(INTERACTIVE)) return
      event.preventDefault(); event.stopPropagation()
      zoom(clamp(live.current.zoom / wheelZoomFactor(event.deltaY, event.deltaMode)))
    }
    const down = (event: PointerEvent) => {
      if (event.button !== 0 || (event.target as Element).closest(INTERACTIVE) || pointers.size >= 2) return
      pointers.set(event.pointerId, [event.clientX, event.clientY])
      if (pointers.size === 1) { origin = [event.clientX, event.clientY]; offset = live.current.offset; moved = false; tapped = event.target as Element }
      else { moved = true; for (const id of pointers.keys()) element.setPointerCapture(id) }
    }
    const move = (event: PointerEvent) => {
      if (!pointers.has(event.pointerId)) return
      const before = [...pointers.values()]
      pointers.set(event.pointerId, [event.clientX, event.clientY])
      if (pointers.size === 2) {
        const after = [...pointers.values()], previousDistance = distance(before)
        if (previousDistance < 1) return
        const nextZoom = clamp(live.current.zoom * distance(after) / previousDistance), ratio = nextZoom / live.current.zoom
        const previous = midpoint(before), next = midpoint(after), box = element.getBoundingClientRect()
        const cx = box.left + box.width / 2, cy = box.top + box.height / 2
        pan([next[0] - cx - (previous[0] - cx - live.current.offset[0]) * ratio, next[1] - cy - (previous[1] - cy - live.current.offset[1]) * ratio])
        zoom(nextZoom); event.preventDefault(); return
      }
      const dx = event.clientX - origin[0], dy = event.clientY - origin[1]
      if (Math.hypot(dx, dy) > 6) { moved = true; element.setPointerCapture(event.pointerId) }
      if (moved) { event.preventDefault(); pan([offset[0] + dx, offset[1] + dy]) }
    }
    const end = (event: PointerEvent) => {
      if (!pointers.delete(event.pointerId)) return
      if (element.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId)
      if (pointers.size === 1) { origin = [...pointers.values()][0]; offset = live.current.offset }
      if (!pointers.size && event.type === "pointerup" && !moved && tapped && element.contains(event.target as Node)) live.current.onTap?.(tapped)
      if (event.type !== "pointerup") moved = true
    }
    const click = (event: MouseEvent) => { if (moved) { event.preventDefault(); event.stopPropagation(); moved = false } }
    element.addEventListener("wheel", wheel, { passive: false })
    element.addEventListener("pointerdown", down); element.addEventListener("pointermove", move)
    element.addEventListener("lostpointercapture", end); element.addEventListener("click", click, true)
    window.addEventListener("pointerup", end); window.addEventListener("pointercancel", end)
    return () => {
      element.removeEventListener("wheel", wheel); element.removeEventListener("pointerdown", down); element.removeEventListener("pointermove", move)
      element.removeEventListener("lostpointercapture", end); element.removeEventListener("click", click, true)
      window.removeEventListener("pointerup", end); window.removeEventListener("pointercancel", end)
      for (const id of pointers.keys()) if (element.hasPointerCapture(id)) element.releasePointerCapture(id)
    }
  }, [ref, enabled])
}
