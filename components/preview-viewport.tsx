"use client"
import { useRef, useState, type ReactNode } from "react"
import { usePreviewGestures } from "./asset-preview-controls"

/** Pan and zoom flat inspection canvases with the game's wheel and touch gestures. */
export function PreviewViewport({ children, aspectRatio }: { children: ReactNode; aspectRatio?: number }) {
  const host = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(1), [offset, setOffset] = useState<[number, number]>([0, 0])
  usePreviewGestures(host, { zoom, offset, onZoom: setZoom, onPan: setOffset, minZoom: .25, maxZoom: 12 })
  return <div ref={host} className="chrome-flat-viewport" style={{ aspectRatio }}>
    <div className="chrome-flat-content" style={{ transform: `translate(${offset[0]}px, ${offset[1]}px) scale(${zoom})` }}>{children}</div>
  </div>
}
