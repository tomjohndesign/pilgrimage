import { create } from "zustand"

import { PROTOTYPE_MAP } from "./map/prototype-map"
import { clampViewSize, DEFAULT_VIEW_SIZE } from "./render/iso"

/** How far past the map edge the camera target may travel. */
const PAN_MARGIN = 6

const MAX_X = PROTOTYPE_MAP.width / 2 + PAN_MARGIN
const MAX_Z = PROTOTYPE_MAP.depth / 2 + PAN_MARGIN

export interface HoveredTile {
  x: number
  z: number
}

interface CameraState {
  /** Camera focus point on the ground plane. */
  targetX: number
  targetZ: number
  /** Unbounded integer so rotation tweens can wrap without spinning backwards. */
  viewIndex: number
  /** Orthographic frustum height in world units. */
  viewSize: number
  hovered: HoveredTile | null

  pan: (dx: number, dz: number) => void
  rotate: (direction: 1 | -1) => void
  zoomBy: (factor: number) => void
  setHovered: (tile: HoveredTile | null) => void
  reset: () => void
}

const INITIAL = {
  // Start looking at the plaza rather than the map centre.
  targetX: 4,
  targetZ: -4,
  viewIndex: 0,
  viewSize: DEFAULT_VIEW_SIZE,
  hovered: null,
}

export const useCameraStore = create<CameraState>((set) => ({
  ...INITIAL,

  pan: (dx, dz) =>
    set((s) => ({
      targetX: Math.min(MAX_X, Math.max(-MAX_X, s.targetX + dx)),
      targetZ: Math.min(MAX_Z, Math.max(-MAX_Z, s.targetZ + dz)),
    })),

  rotate: (direction) => set((s) => ({ viewIndex: s.viewIndex + direction })),

  zoomBy: (factor) => set((s) => ({ viewSize: clampViewSize(s.viewSize * factor) })),

  setHovered: (tile) =>
    set((s) => {
      // Avoid a store write (and re-render) on every mouse move within a tile.
      if (tile === s.hovered) return s
      if (tile && s.hovered && tile.x === s.hovered.x && tile.z === s.hovered.z) return s
      return { hovered: tile }
    }),

  reset: () => set({ ...INITIAL }),
}))
