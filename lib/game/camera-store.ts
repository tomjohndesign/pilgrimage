import { create } from "zustand"

import { DEFAULT_MAP_DEPTH, DEFAULT_MAP_WIDTH } from "./map/generate-map"
import { clampViewSize, DEFAULT_VIEW_SIZE, maxViewSizeForMap, WALK_VIEW_SIZE } from "./render/iso"
import { DEFAULT_OUTLINE_MODE, nextOutlineMode, type OutlineMode } from "./render/outline"

/** How far past the map edge the camera target may travel. */
const PAN_MARGIN = 6

export interface HoveredTile {
  x: number
  z: number
}

/** One thing selected at a time, whatever kind it is. */
export type Selection =
  | { kind: "traveler"; id: number }
  | { kind: "animal"; id: number }
  | { kind: "monk"; id: number }
  | { kind: "relic" }
  | { kind: "building"; id: string }
  | { kind: "tree"; id: number }
  | { kind: "pile"; id: string }

export function isSelected(selection: Selection | null, candidate: Selection): boolean {
  if (!selection || selection.kind !== candidate.kind) return false
  return selection.kind === "relic" || selection.id === (candidate as { id: number | string }).id
}

/** The camera can only walk beside someone who walks the world on their own feet. */
export function canWalkWith(selection: Selection | null): boolean {
  return selection?.kind === "traveler" || selection?.kind === "monk"
}

/** The view a walk interrupted, given back when the player steps out of it. */
interface WalkReturn {
  viewSize: number
  viewIndex: number
}

interface CameraState {
  /** User camera input waits for the opening map reveal. */
  inputLocked: boolean
  /** Camera focus point on the ground plane. */
  targetX: number
  targetZ: number
  /** Unbounded quarter turns; fractional during a touch twist, snapped on release. */
  viewIndex: number
  /** Orthographic frustum height in world units. */
  viewSize: number
  hovered: HoveredTile | null
  /** How the outline pass separates overlapping objects. Not part of reset(). */
  outlineMode: OutlineMode
  /** Current map extent; the pan clamp follows whatever map is loaded. */
  mapWidth: number
  mapDepth: number
  /** What the player clicked — a traveler, a monk, or the relic. Not part of reset(). */
  selection: Selection | null
  /**
   * The camera tracks the selection each frame (a traveler's whole party when
   * they have one). Any player pan releases it, as does changing the selection.
   */
  following: boolean
  /**
   * The camera walks the road with the selected person: a near view, their own
   * position rather than their company's centre, and a turn with every turn of
   * the road so their way ahead runs up the screen. Implies `following`; panning
   * or turning the view by hand steps back out of it, as a pan releases a follow.
   */
  walkWith: boolean
  walkReturn: WalkReturn | null

  pan: (dx: number, dz: number) => void
  /** Jump the focus straight to a world point — the minimap's click-to-travel. */
  panTo: (x: number, z: number) => void
  rotate: (direction: 1 | -1) => void
  zoomBy: (factor: number) => void
  setHovered: (tile: HoveredTile | null) => void
  cycleOutlineMode: () => void
  setMapSize: (width: number, depth: number) => void
  select: (selection: Selection | null) => void
  setFollowing: (following: boolean) => void
  setWalkWith: (walkWith: boolean) => void
  /** The per-frame follow step: moves the focus without releasing the follow. */
  follow: (x: number, z: number) => void
  /** The per-frame walk step: turns the view with the walker without ending the walk. */
  steer: (viewIndex: number) => void
  reset: () => void
}

const INITIAL = {
  // Map centre by default; the shell pans to the hovel once a map loads.
  targetX: 0,
  targetZ: 0,
  viewIndex: 0,
  viewSize: DEFAULT_VIEW_SIZE,
  hovered: null,
}

/** What a player camera move lets go of: the follow, and the walk that implies it. */
const RELEASED = { following: false, walkWith: false, walkReturn: null }

/** Clamp a target point to the map extent plus the pan margin. */
function clampTarget(
  s: { mapWidth: number; mapDepth: number },
  x: number,
  z: number,
): { targetX: number; targetZ: number } {
  const maxX = s.mapWidth / 2 + PAN_MARGIN
  const maxZ = s.mapDepth / 2 + PAN_MARGIN
  return {
    targetX: Math.min(maxX, Math.max(-maxX, x)),
    targetZ: Math.min(maxZ, Math.max(-maxZ, z)),
  }
}

/**
 * Step out of a walk the intended way: the borrowed view goes back as it was.
 * A camera the player has since moved by hand keeps their framing instead —
 * those moves clear `walkReturn` as they release the walk.
 */
function leaveWalk(s: { walkReturn: WalkReturn | null; mapWidth: number; mapDepth: number }) {
  const back = s.walkReturn
  return back
    ? { ...RELEASED, viewIndex: back.viewIndex, viewSize: clampViewSize(back.viewSize, maxViewSizeForMap(s.mapWidth, s.mapDepth)) }
    : RELEASED
}

export const useCameraStore = create<CameraState>((set) => ({
  ...INITIAL,
  outlineMode: DEFAULT_OUTLINE_MODE,
  mapWidth: DEFAULT_MAP_WIDTH,
  mapDepth: DEFAULT_MAP_DEPTH,
  selection: null,
  following: false,
  walkWith: false,
  walkReturn: null,
  inputLocked: false,

  // A hand on the camera ends a walk where it stands: the player has taken the
  // view somewhere of their own, so handing back the one the walk began from
  // would only fight them. Leaving by the button restores it instead.
  pan: (dx, dz) =>
    set((s) => s.inputLocked ? s : { ...RELEASED, ...clampTarget(s, s.targetX + dx, s.targetZ + dz) }),

  panTo: (x, z) => set((s) => s.inputLocked ? s : { ...RELEASED, ...clampTarget(s, x, z) }),

  rotate: (direction) => set((s) => s.inputLocked ? s : ({ viewIndex: s.viewIndex + direction, ...RELEASED })),

  zoomBy: (factor) =>
    set((s) => s.inputLocked ? s : ({
      viewSize: clampViewSize(s.viewSize * factor, maxViewSizeForMap(s.mapWidth, s.mapDepth)),
    })),

  setHovered: (tile) =>
    set((s) => {
      // Avoid a store write (and re-render) on every mouse move within a tile.
      if (tile === s.hovered) return s
      if (tile && s.hovered && tile.x === s.hovered.x && tile.z === s.hovered.z) return s
      return { hovered: tile }
    }),

  cycleOutlineMode: () => set((s) => ({ outlineMode: nextOutlineMode(s.outlineMode) })),

  // Loading a smaller map may leave the camera zoomed out past the new cap,
  // so the view size re-clamps along with the pan bounds.
  setMapSize: (width, depth) =>
    set((s) => ({
      mapWidth: width,
      mapDepth: depth,
      viewSize: clampViewSize(s.viewSize, maxViewSizeForMap(width, depth)),
      ...clampTarget({ mapWidth: width, mapDepth: depth }, s.targetX, s.targetZ),
    })),

  select: (selection) => set((s) => ({ selection, ...leaveWalk(s) })),

  setFollowing: (following) => set((s) => s.selection && following ? { following } : leaveWalk(s)),

  // The walk borrows the view and gives it back. Starting one inside another
  // would overwrite what the first borrowed, so an unchanged flag does nothing.
  setWalkWith: (walkWith) =>
    set((s) => {
      if (s.inputLocked || walkWith === s.walkWith) return s
      if (!walkWith) return leaveWalk(s)
      if (!canWalkWith(s.selection)) return s
      return {
        walkWith: true,
        following: true,
        walkReturn: { viewSize: s.viewSize, viewIndex: s.viewIndex },
        viewSize: clampViewSize(WALK_VIEW_SIZE, maxViewSizeForMap(s.mapWidth, s.mapDepth)),
      }
    }),

  follow: (x, z) => set((s) => s.following ? clampTarget(s, x, z) : s),

  steer: (viewIndex) => set((s) => s.walkWith && viewIndex !== s.viewIndex ? { viewIndex } : s),

  // Deliberately leaves mapWidth/mapDepth alone — reset is a camera action.
  reset: () =>
    set((s) => s.inputLocked ? s : ({
      ...INITIAL,
      ...RELEASED,
      viewSize: clampViewSize(DEFAULT_VIEW_SIZE, maxViewSizeForMap(s.mapWidth, s.mapDepth)),
    })),
}))
