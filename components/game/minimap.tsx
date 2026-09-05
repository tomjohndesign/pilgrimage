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
const DISPLAY_WIDTH = 144
const DISPLAY_HEIGHT = Math.ceil(DISPLAY_WIDTH * Math.sin(ISO_PITCH))
const CANVAS_WIDTH = DISPLAY_WIDTH * 2
const CANVAS_HEIGHT = DISPLAY_HEIGHT * 2
const PADDING = 4

/** Project world X/Z with the same orientation and pitch as the main camera. */
function mapTransform(map: GameMap, viewIndex: number): DOMMatrix {
  const b = screenBasis(yawForView(viewIndex))
  const sinPitch = Math.sin(ISO_PITCH)
  const width = Math.abs(b.rightX) * map.width + Math.abs(b.rightZ) * map.depth
  const height = (Math.abs(b.fwdX) * map.width + Math.abs(b.fwdZ) * map.depth) * sinPitch
  const scale = Math.min(
    (CANVAS_WIDTH - PADDING * 2) / width,
    (CANVAS_HEIGHT - PADDING * 2) / height,
  )
  return new DOMMatrix([
    b.rightX * scale,
    -b.fwdX * sinPitch * scale,
    b.rightZ * scale,
    -b.fwdZ * sinPitch * scale,
    CANVAS_WIDTH / 2,
    CANVAS_HEIGHT / 2,
  ])
}

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

    const draw = () => {
      const { targetX, targetZ, viewIndex, viewSize } = useCameraStore.getState()
      const transform = mapTransform(map, viewIndex)
      const project = (wx: number, wz: number) => transform.transformPoint({ x: wx, y: wz })

      ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
      ctx.imageSmoothingEnabled = false
      ctx.save()
      ctx.setTransform(transform)
      ctx.drawImage(base, -map.width / 2, -map.depth / 2)
      for (const building of map.buildings) {
        ctx.fillStyle = building.id === map.site?.hovelId ? "#e1c777" : "#d4975b"
        ctx.fillRect(building.x - map.width / 2, building.z - map.depth / 2, building.w, building.d)
      }
      ctx.restore()

      // Keep the viewport outline inside the projected map's diamond.
      ctx.save()
      ctx.beginPath()
      const edges = [
        [-map.width / 2, -map.depth / 2],
        [map.width / 2, -map.depth / 2],
        [map.width / 2, map.depth / 2],
        [-map.width / 2, map.depth / 2],
      ]
      edges.forEach(([wx, wz], i) => {
        const point = project(wx, wz)
        if (i === 0) ctx.moveTo(point.x, point.y)
        else ctx.lineTo(point.x, point.y)
      })
      ctx.closePath()
      ctx.clip()

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
        const point = project(wx, wz)
        if (i === 0) ctx.moveTo(point.x, point.y)
        else ctx.lineTo(point.x, point.y)
      })
      ctx.closePath()
      ctx.stroke()
      ctx.restore()
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

    const travel = (event: PointerEvent, clampToMap = false) => {
      const rect = canvas.getBoundingClientRect()
      const u = (event.clientX - rect.left) / rect.width
      const v = (event.clientY - rect.top) / rect.height
      const point = mapTransform(map, useCameraStore.getState().viewIndex)
        .inverse()
        .transformPoint({ x: u * CANVAS_WIDTH, y: v * CANVAS_HEIGHT })
      const halfWidth = map.width / 2
      const halfDepth = map.depth / 2
      // Empty corners aren't map locations; dragging past an edge stays on it.
      if (!clampToMap && (Math.abs(point.x) > halfWidth || Math.abs(point.y) > halfDepth)) {
        return false
      }
      panTo(
        Math.max(-halfWidth, Math.min(halfWidth, point.x)),
        Math.max(-halfDepth, Math.min(halfDepth, point.y)),
      )
      return true
    }

    const onPointerDown = (event: PointerEvent) => {
      if (!travel(event)) return
      dragging = true
      canvas.setPointerCapture(event.pointerId)
    }
    const onPointerMove = (event: PointerEvent) => {
      if (dragging) travel(event, true)
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
      width={CANVAS_WIDTH}
      height={CANVAS_HEIGHT}
      style={{ width: DISPLAY_WIDTH, height: DISPLAY_HEIGHT, imageRendering: "pixelated" }}
      className="pointer-events-auto touch-none cursor-crosshair"
      aria-label="Minimap"
    />
  )
}
