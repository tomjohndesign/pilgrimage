"use client"
import { useEffect, useRef, useState, type ReactNode } from "react"
import { wheelZoomFactor } from "@/lib/game/render/camera-input"

/** Pan and zoom flat inspection canvases with the game's wheel response. */
export function PreviewViewport({ children, aspectRatio }: { children: ReactNode; aspectRatio?: number }) {
  const host = useRef<HTMLDivElement>(null), drag = useRef<{ x: number; y: number; start: [number, number] } | null>(null), moved = useRef(false)
  const [zoom, setZoom] = useState(1), [offset, setOffset] = useState<[number, number]>([0, 0])
  useEffect(() => {
    const element = host.current; if (!element) return
    const wheel = (event: WheelEvent) => { event.preventDefault(); event.stopPropagation(); setZoom(value => Math.max(.25, Math.min(12, value / wheelZoomFactor(event.deltaY, event.deltaMode)))) }
    element.addEventListener("wheel", wheel, { passive: false })
    return () => element.removeEventListener("wheel", wheel)
  }, [])
  return <div ref={host} className="chrome-flat-viewport" style={{ aspectRatio }}
    onPointerDown={event => {
      if (event.button !== 0 || (event.target as Element).closest('button, [role="button"], input, select, a')) return
      moved.current = false; drag.current = { x: event.clientX, y: event.clientY, start: offset }
    }}
    onPointerMove={event => { const start = drag.current; if (!start) return
      const dx = event.clientX - start.x, dy = event.clientY - start.y
      if (Math.hypot(dx, dy) > 6) { moved.current = true; event.currentTarget.setPointerCapture(event.pointerId) }
      setOffset([start.start[0] + dx, start.start[1] + dy])
    }}
    onPointerUp={event => { drag.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId) }}
    onLostPointerCapture={() => { drag.current = null }}
    onClickCapture={event => { if (moved.current) { event.preventDefault(); event.stopPropagation(); moved.current = false } }}>
    <div className="chrome-flat-content" style={{ transform: `translate(${offset[0]}px, ${offset[1]}px) scale(${zoom})` }}>{children}</div>
  </div>
}
