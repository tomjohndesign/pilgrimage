"use client"

import { useEffect } from "react"
import { useThree } from "@react-three/fiber"
import * as THREE from "three"

import { usePixelCapture, type WorldCapture } from "@/components/pixel-canvas"
import { useCameraStore } from "@/lib/game/camera-store"
import type { GameMap } from "@/lib/game/map/types"
import { objectTileDistance, texelObjectId } from "@/lib/game/render/object-tiles"
import type { TreePlacement } from "@/lib/game/trees/placement"
import { worldObjectIds } from "./outline-pass"
import { ISO_PITCH, screenBasis, yawForView, yawFromForward } from "@/lib/game/render/iso"
import { sceneryZooming } from "@/lib/game/render/scenery-detail"
import type { CameraSave, WorldIdentity } from "@/lib/game/save/schema"
import { NEAR_SHIFT, tileDiscAlpha, viewSnapshotExtent, type ViewSnapshot } from "@/lib/game/save/view"

/**
 * Takes the picture of the land under the camera that the autosave keeps.
 * `request` answers from the next frame's own render and encodes off the main
 * thread; `now` renders a frame and encodes at once, for the moment the page
 * is going away. Either gives null while the camera is still settling on its
 * saved pose, since a frame mid-tween would not match that pose, and the
 * periodic one also waits out a scenery detail change, whose frames are a
 * blend of two levels.
 */
export const viewSnapshotRegistry: {
  current: {
    request: (world: WorldIdentity, onResult: (view: ViewSnapshot | null) => void) => void
    now: (world: WorldIdentity) => ViewSnapshot | null
  } | null
} = { current: null }

/**
 * The picture must be the frame itself, so it is stored losslessly: WebP at
 * quality 1 is lossless in Chromium and a quarter smaller than PNG; browsers
 * without a WebP encoder give PNG from the same call.
 */
const IMAGE_TYPE = "image/webp"
const IMAGE_QUALITY = 1

/** Reused for encoding: the crop is several hundred texels each way. */
let encoder: HTMLCanvasElement | null = null

function paint(capture: WorldCapture): HTMLCanvasElement | null {
  encoder ??= document.createElement("canvas")
  encoder.width = capture.cols; encoder.height = capture.rows
  const context = encoder.getContext("2d")
  if (!context) return null
  context.putImageData(new ImageData(capture.data, capture.cols, capture.rows), 0, 0)
  return encoder
}

function encodeNow(capture: WorldCapture): string | null {
  return paint(capture)?.toDataURL(IMAGE_TYPE, IMAGE_QUALITY) ?? null
}

function encodeLater(capture: WorldCapture, onResult: (image: string | null) => void): void {
  const canvas = paint(capture)
  if (!canvas) return onResult(null)
  canvas.toBlob(blob => {
    if (!blob) return onResult(null)
    const reader = new FileReader()
    reader.onload = () => onResult(typeof reader.result === "string" ? reader.result : null)
    reader.onerror = () => onResult(null)
    reader.readAsDataURL(blob)
  }, IMAGE_TYPE, IMAGE_QUALITY)
}

/**
 * Cut the capture into a disc of whole tiles by writing its alpha. A texel
 * showing a tree or building takes the opacity of the tile that object stands
 * on, so it shows entire or not at all; bare ground is projected onto the
 * ground plane under the camera focus and takes the tile it lands on. The
 * edge then reads as tiles with their contents rather than a vignette. The
 * disc's centre lies a little towards the viewer from the focus.
 */
function cutTileDisc(region: WorldCapture, pose: CameraSave, radius: number, map: GameMap, trees: readonly TreePlacement[], ids: Uint8Array | null): void {
  const basis = screenBasis(yawForView(pose.viewIndex)), rise = Math.sin(ISO_PITCH)
  const { cols, rows, density, data } = region
  const width = cols / density, height = rows / density
  const centreX = pose.targetX + map.width / 2 - NEAR_SHIFT * basis.fwdX, centreZ = pose.targetZ + map.depth / 2 - NEAR_SHIFT * basis.fwdZ
  for (let row = 0; row < rows; row++) {
    const up = height / 2 - (row + .5) / density - region.offsetY
    for (let col = 0; col < cols; col++) {
      let distance = ids ? objectTileDistance(texelObjectId(ids, ((rows - 1 - row) * cols + col) * 4), centreX, centreZ, map, trees) : null
      if (distance === null) {
        const right = (col + .5) / density - width / 2 + region.offsetX
        const dx = right * basis.rightX + up / rise * basis.fwdX, dz = right * basis.rightZ + up / rise * basis.fwdZ
        distance = Math.hypot(Math.floor(pose.targetX + dx + map.width / 2) + .5 - centreX, Math.floor(pose.targetZ + dz + map.depth / 2) + .5 - centreZ)
      }
      data[(row * cols + col) * 4 + 3] = Math.round(255 * tileDiscAlpha(distance, radius))
    }
  }
}

const forward = new THREE.Vector3()

/** The rig's tweened yaw and zoom have reached the pose the save records. */
function settledPose(camera: THREE.OrthographicCamera): CameraSave | null {
  const { targetX, targetZ, viewIndex, viewSize } = useCameraStore.getState()
  if (Math.abs(camera.top - camera.bottom - viewSize) > 1e-3) return null
  camera.getWorldDirection(forward)
  const turn = (yawFromForward(forward.x, forward.z) - yawForView(viewIndex)) / (2 * Math.PI)
  if (Math.abs(turn - Math.round(turn)) > 1e-4) return null
  return { targetX, targetZ, viewIndex, viewSize }
}

export function ViewSnapshotCapture({ pixelsPerUnit, map, trees }: { pixelsPerUnit: number; map: GameMap; trees: readonly TreePlacement[] }) {
  const capture = usePixelCapture()
  const camera = useThree(s => s.camera) as THREE.OrthographicCamera
  const scene = useThree(s => s.scene)
  useEffect(() => {
    // The pass draws at most the character density, so the cap holds at that.
    const extent = () => viewSnapshotExtent(camera.right - camera.left, camera.top - camera.bottom, pixelsPerUnit)
    // The IDs are read from the same frame as the colour, before anything else renders.
    const cut = (region: WorldCapture, pose: CameraSave, radius: number) => {
      worldObjectIds.wanted = false
      cutTileDisc(region, pose, radius, map, trees, worldObjectIds.read?.(region.x0, region.y0, region.cols, region.rows) ?? null)
      return region
    }
    const assemble = (world: WorldIdentity, pose: CameraSave, region: WorldCapture, image: string | null): ViewSnapshot | null =>
      image ? { world, camera: pose, image, width: region.cols / region.density, height: region.rows / region.density,
        offsetX: region.offsetX, offsetY: region.offsetY } : null
    viewSnapshotRegistry.current = {
      request: (world, onResult) => {
        if (sceneryZooming(scene) || scene.userData.sceneryFadeActive === true) return onResult(null)
        worldObjectIds.wanted = true
        const { halfWidth, halfHeight, up, radius } = extent()
        capture.request(halfWidth, halfHeight, up, region => {
          const pose = region && settledPose(camera)
          if (!region || !pose) { worldObjectIds.wanted = false; return onResult(null) }
          encodeLater(cut(region, pose, radius), image => onResult(assemble(world, pose, region, image)))
        })
      },
      now: world => {
        worldObjectIds.wanted = true
        const { halfWidth, halfHeight, up, radius } = extent()
        const region = capture.now(halfWidth, halfHeight, up)
        const pose = region && settledPose(camera)
        if (!region || !pose) { worldObjectIds.wanted = false; return null }
        return assemble(world, pose, region, encodeNow(cut(region, pose, radius)))
      },
    }
    return () => { viewSnapshotRegistry.current = null; worldObjectIds.wanted = false }
  }, [camera, scene, capture, pixelsPerUnit, map, trees])
  return null
}
