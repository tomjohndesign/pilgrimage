import { create } from "zustand"

import { DEFAULT_MAP_DEPTH, DEFAULT_MAP_WIDTH } from "./map/generate-map"
import { clampViewSize, DEFAULT_VIEW_SIZE } from "./render/iso"
import { DEFAULT_OUTLINE_MODE, nextOutlineMode, type OutlineMode } from "./render/outline"

/** How far past the map edge the camera target may travel. */
const PAN_MARGIN = 6

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
  /** How the outline pass separates overlapping objects. Not part of reset(). */
  outlineMode: OutlineMode
  /** Current map extent; the pan clamp follows whatever map is loaded. */
  mapWidth: number
  mapDepth: number
  /** Traveler the player clicked, by traveler id. Not part of reset(). */
  selectedTravelerId: number | null

  pan: (dx: number, dz: number) => void
  rotate: (direction: 1 | -1) => void
  zoomBy: (factor: number) => void
  setHovered: (tile: HoveredTile | null) => void
  cycleOutlineMode: () => void
  setMapSize: (width: number, depth: number) => void
  selectTraveler: (id: number | null) => void
  reset: () => void
}

const INITIAL = {
  // Generated maps have no landmark to favour, so start at the map centre.
  targetX: 0,
  targetZ: 0,
  viewIndex: 0,
  viewSize: DEFAULT_VIEW_SIZE,
  hovered: null,
}

export const useCameraStore = create<CameraState>((set) => ({
  ...INITIAL,
  outlineMode: DEFAULT_OUTLINE_MODE,
  mapWidth: DEFAULT_MAP_WIDTH,
  mapDepth: DEFAULT_MAP_DEPTH,
  selectedTravelerId: null,

  pan: (dx, dz) =>
    set((s) => {
      const maxX = s.mapWidth / 2 + PAN_MARGIN
      const maxZ = s.mapDepth / 2 + PAN_MARGIN
      return {
        targetX: Math.min(maxX, Math.max(-maxX, s.targetX + dx)),
        targetZ: Math.min(maxZ, Math.max(-maxZ, s.targetZ + dz)),
      }
    }),

  rotate: (direction) => set((s) => ({ viewIndex: s.viewIndex + direction })),

  zoomBy: (factor) => set((s) => ({ viewSize: clampViewSize(s.viewSize * factor) })),

  setHovered: (tile) =>
    set((s) => {
      // Avoid a store write (and re-render) on every mouse move within a tile.
      if (tile === s.hovered) return s
      if (tile && s.hovered && tile.x === s.hovered.x && tile.z === s.hovered.z) return s
      return { hovered: tile }
    }),

  cycleOutlineMode: () => set((s) => ({ outlineMode: nextOutlineMode(s.outlineMode) })),

  setMapSize: (width, depth) => set({ mapWidth: width, mapDepth: depth }),

  selectTraveler: (id) => set({ selectedTravelerId: id }),

  // Deliberately leaves mapWidth/mapDepth alone — reset is a camera action.
  reset: () => set({ ...INITIAL }),
}))
