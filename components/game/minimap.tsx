"use client"

import { useEffect, useRef } from "react"

import { useCameraStore } from "@/lib/game/camera-store"
import { useBalanceStore } from "@/lib/game/balance-store"
import { getBuildInfluence } from "@/lib/game/build-influence"
import { useBuildStore } from "@/lib/game/build-store"
import { TERRAIN, type TerrainId } from "@/lib/game/map/terrain"
import type { GameMap } from "@/lib/game/map/types"
import { ISO_PITCH, screenBasis, yawForView } from "@/lib/game/render/iso"
import { relicIsCarried } from "@/lib/game/relic-procession"
import { shrineLayout } from "@/lib/game/shrine-layout"

/**
 * Overview map drawn from tile data, one texel per tile — never from the 3D
 * scene, so its cost is independent of what the renderer is doing. With the
 * zoom-out cap this is how the player reads (and travels) a map too large to
 * frame in the camera: click or drag to move the focus there.
 *
 * Drawing is imperative: the terrain is rasterised once per map into an
 * offscreen canvas, and camera and simulation updates redraw the overlays
 * via store subscriptions — no React re-renders on pan or zoom.
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
const INFLUENCE_COLOR = "#e4c77f"
const BUILDING_COLOR = "#ef4444"
const INFLUENCE_OUTLINE = "#30271c"

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

/** Live map in the persistent bottom-right details dock.
 * @see https://app.paper.design/file/01M1QTYBYHXP4H1BXFQ79N18AP/2-0/1SK-0
 */
export function Minimap({ map }: { map: GameMap }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const balance = useBalanceStore((s) => s.balance)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx) return

    // Built here, not in render: the HUD server-renders, and canvas needs DOM.
    const base = renderBase(map)
    const influence = getBuildInfluence(map, balance).radiated
    const influenceCanvas = document.createElement("canvas")
    influenceCanvas.width = map.width
    influenceCanvas.height = map.depth
    const influenceCtx = influenceCanvas.getContext("2d")
    const boundary = new Path2D()
    if (influenceCtx) {
      influenceCtx.fillStyle = INFLUENCE_COLOR
      for (let z = 0; z < map.depth; z++) {
        for (let x = 0; x < map.width; x++) {
          if (!influence[z * map.width + x]) continue
          influenceCtx.fillRect(x, z, 1, 1)
          for (const [dx, dz, ax, az, bx, bz] of [
            [-1, 0, 0, 0, 0, 1], [1, 0, 1, 0, 1, 1],
            [0, -1, 0, 0, 1, 0], [0, 1, 0, 1, 1, 1],
          ]) {
            const nx = x + dx, nz = z + dz
            if (nx >= 0 && nz >= 0 && nx < map.width && nz < map.depth && influence[nz * map.width + nx]) continue
            boundary.moveTo(x + ax - map.width / 2, z + az - map.depth / 2)
            boundary.lineTo(x + bx - map.width / 2, z + bz - map.depth / 2)
          }
        }
      }
    }
    const shrine = map.buildings.find((building) => building.id === map.site?.hovelId)
    const altarOffset = shrine ? shrineLayout(shrine, map.site?.door).offset : null

    const draw = () => {
      const { targetX, targetZ, viewIndex, viewSize } = useCameraStore.getState()
      const transform = mapTransform(map, viewIndex)
      const project = (wx: number, wz: number) => transform.transformPoint({ x: wx, y: wz })

      ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
      ctx.imageSmoothingEnabled = false
      ctx.save()
      ctx.setTransform(transform)
      ctx.drawImage(base, -map.width / 2, -map.depth / 2)
      ctx.globalAlpha = 0.35
      ctx.drawImage(influenceCanvas, -map.width / 2, -map.depth / 2)
      ctx.globalAlpha = 1
      ctx.restore()

      // Stroke in screen space so the boundary stays legible on large maps.
      const projectedBoundary = new Path2D()
      projectedBoundary.addPath(boundary, transform)
      ctx.strokeStyle = INFLUENCE_OUTLINE
      ctx.lineWidth = 4
      ctx.stroke(projectedBoundary)
      ctx.strokeStyle = INFLUENCE_COLOR
      ctx.lineWidth = 2
      ctx.stroke(projectedBoundary)

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

      // Draw actual building footprints at the terrain's scale, above the viewport.
      ctx.save()
      ctx.setTransform(transform)
      ctx.fillStyle = BUILDING_COLOR
      for (const building of map.buildings) {
        ctx.fillRect(building.x - map.width / 2, building.z - map.depth / 2, building.w, building.d)
      }
      ctx.restore()

      if (shrine && altarOffset) {
        const sim = useBuildStore.getState().simulation
        const procession = sim?.world.road === map.road ? sim?.procession : null
        const position = procession && relicIsCarried(procession) ? procession.position : null
        const point = project(
          position?.x ?? shrine.x + shrine.w / 2 - map.width / 2 + altarOffset.x,
          position?.z ?? shrine.z + shrine.d / 2 - map.depth / 2 + altarOffset.z,
        )
        const x = Math.round(point.x), y = Math.round(point.y)
        ctx.fillStyle = "#ffffff"
        ctx.fillRect(x - 6, y - 6, 12, 12)
        ctx.fillStyle = "#000000"
        ctx.fillRect(x - 4, y - 4, 8, 8)
      }
    }

    draw()
    const unsubscribe = useCameraStore.subscribe(draw)
    const unsubscribeSimulation = useBuildStore.subscribe(draw)
    window.addEventListener("resize", draw)
    return () => {
      unsubscribe()
      unsubscribeSimulation()
      window.removeEventListener("resize", draw)
    }
  }, [map, balance])

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
      style={{ width: "100%", height: "auto", imageRendering: "pixelated" }}
      className="pointer-events-auto touch-none cursor-crosshair"
      aria-label="Minimap"
    />
  )
}
