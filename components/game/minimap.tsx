"use client"

import { useEffect, useRef } from "react"

import { useCameraStore } from "@/lib/game/camera-store"
import { TERRAIN, type TerrainId } from "@/lib/game/map/terrain"
import type { GameMap } from "@/lib/game/map/types"
import { ISO_PITCH, screenBasis, yawForView } from "@/lib/game/render/iso"

/**
 * Overview map drawn from tile data, one texel per tile — never from the 3D
 * scene, so its cost is independent of what the renderer is doing. With the
 * zoom-out cap this is how the player reads (and travels) a map too large to
 * frame in the camera: click or drag to move the focus there.
 *
 * Drawing is imperative: the terrain is rasterised once per map into an
 * offscreen canvas, and camera changes only re-blit it and stroke the view
 * rectangle via a store subscription — no React re-renders on pan or zoom.
 */

/** CSS size of the widget; the backing store is 2× for crisp 1px-per-tile texels. */
const DISPLAY_PX = 144
const CANVAS_PX = DISPLAY_PX * 2

const VIEWPORT_STROKE = "#f2e8d5"

function terrainPalette(): Record<TerrainId, [number, number, number]> {
  const palette = {} as Record<TerrainId, [number, number, number]>
  for (const def of Object.values(TERRAIN)) {
    const hex = Number.parseInt(def.color.slice(1), 16)
    palette[def.id] = [(hex >> 16) & 0xff, (hex >> 8) & 0xff, hex & 0xff]
  }
  return palette
}

/** Rasterise the map to an offscreen canvas, one pixel per tile. */
function renderBase(map: GameMap): HTMLCanvasElement {
  const base = document.createElement("canvas")
  base.width = map.width
  base.height = map.depth
  const ctx = base.getContext("2d")
  if (!ctx) return base

  const palette = terrainPalette()
  const image = ctx.createImageData(map.width, map.depth)
  for (let i = 0; i < map.tiles.length; i++) {
    const [r, g, b] = palette[map.tiles[i]]
    image.data[i * 4] = r
    image.data[i * 4 + 1] = g
    image.data[i * 4 + 2] = b
    image.data[i * 4 + 3] = 255
  }
  ctx.putImageData(image, 0, 0)
  return base
}

export function Minimap({ map }: { map: GameMap }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx) return

    // Built here, not in render: the HUD server-renders, and canvas needs DOM.
    const base = renderBase(map)

    // World units per canvas pixel; maps are square but derive both anyway.
    const scaleX = CANVAS_PX / map.width
    const scaleZ = CANVAS_PX / map.depth
    const toPxX = (wx: number) => (wx + map.width / 2) * scaleX
    const toPxZ = (wz: number) => (wz + map.depth / 2) * scaleZ

    const draw = () => {
      const { targetX, targetZ, viewIndex, viewSize } = useCameraStore.getState()

      ctx.imageSmoothingEnabled = false
      ctx.drawImage(base, 0, 0, CANVAS_PX, CANVAS_PX)

      // The camera's ground footprint: a rectangle spanning the frustum, laid
      // on the ground along the screen axes — so it rotates with the view.
      // Depth (screen-up) is stretched by 1/sin(pitch), the iso foreshortening.
      const b = screenBasis(yawForView(viewIndex))
      const aspect = window.innerWidth / Math.max(1, window.innerHeight)
      const halfR = (viewSize * aspect) / 2
      const halfF = viewSize / (2 * Math.sin(ISO_PITCH))

      ctx.strokeStyle = VIEWPORT_STROKE
      ctx.lineWidth = 2
      ctx.beginPath()
      const corners: Array<[number, number]> = [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ]
      corners.forEach(([sr, sf], i) => {
        const wx = targetX + b.rightX * halfR * sr + b.fwdX * halfF * sf
        const wz = targetZ + b.rightZ * halfR * sr + b.fwdZ * halfF * sf
        if (i === 0) ctx.moveTo(toPxX(wx), toPxZ(wz))
        else ctx.lineTo(toPxX(wx), toPxZ(wz))
      })
      ctx.closePath()
      ctx.stroke()
    }

    draw()
    const unsubscribe = useCameraStore.subscribe(draw)
    window.addEventListener("resize", draw)
    return () => {
      unsubscribe()
      window.removeEventListener("resize", draw)
    }
  }, [map])

  // Click or drag anywhere on the map to send the camera focus there.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const { panTo } = useCameraStore.getState()

    let dragging = false

    const travel = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      const u = (event.clientX - rect.left) / rect.width
      const v = (event.clientY - rect.top) / rect.height
      panTo(u * map.width - map.width / 2, v * map.depth - map.depth / 2)
    }

    const onPointerDown = (event: PointerEvent) => {
      dragging = true
      canvas.setPointerCapture(event.pointerId)
      travel(event)
    }
    const onPointerMove = (event: PointerEvent) => {
      if (dragging) travel(event)
    }
    const onPointerEnd = (event: PointerEvent) => {
      if (!dragging) return
      dragging = false
      canvas.releasePointerCapture(event.pointerId)
    }

    canvas.addEventListener("pointerdown", onPointerDown)
    canvas.addEventListener("pointermove", onPointerMove)
    canvas.addEventListener("pointerup", onPointerEnd)
    canvas.addEventListener("pointercancel", onPointerEnd)
    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown)
      canvas.removeEventListener("pointermove", onPointerMove)
      canvas.removeEventListener("pointerup", onPointerEnd)
      canvas.removeEventListener("pointercancel", onPointerEnd)
    }
  }, [map])

  return (
    <canvas
      ref={canvasRef}
      width={CANVAS_PX}
      height={CANVAS_PX}
      style={{ width: DISPLAY_PX, height: DISPLAY_PX, imageRendering: "pixelated" }}
      className="pointer-events-auto mt-1.5 cursor-crosshair border border-rule"
      aria-label="Minimap"
    />
  )
}
