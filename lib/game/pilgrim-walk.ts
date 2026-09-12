import type { Selection } from "./camera-store"
import { monkPositionRegistry } from "./monks"
import { ISO_YAW_BASE, VIEW_COUNT } from "./render/iso"
import { simRegistry } from "./sim"

export interface WalkPoint {
  x: number
  z: number
}

/**
 * How far ahead of the walker the camera looks, in world units. It sets them
 * a little below the centre of the screen, so the road they are about to take
 * fills more of the view than the one behind them.
 */
export const WALK_LOOK_AHEAD = 1.5

/**
 * Slack around the halfway point between two quarter views, in view steps. A
 * road that wanders either side of a diagonal would otherwise swing the camera
 * back and forth; the view only gives way once the walker is well past the turn.
 */
export const WALK_TURN_MARGIN = 0.15

/**
 * Where the camera walks. Unlike a follow, this is the one person the player
 * chose and never the centre of their company: the point of the walk is their
 * own road, so companions fall behind and catch up around them. Null once they
 * have left the world, which ends the walk.
 */
export function walkPoint(selection: Selection | null): WalkPoint | null {
  if (!selection) return null
  if (selection.kind === "traveler") {
    const walker = simRegistry.current?.travelers.get(selection.id)
    return walker ? { x: walker.x, z: walker.z } : null
  }
  if (selection.kind === "monk") {
    const monk = monkPositionRegistry.current?.get(selection.id)
    return monk ? { x: monk.x, z: monk.z } : null
  }
  return null
}

/** The ground point the camera holds: the walker, pushed forward along their heading. */
export function walkTarget(point: WalkPoint, heading: number, ahead: number = WALK_LOOK_AHEAD): WalkPoint {
  return { x: point.x + Math.sin(heading) * ahead, z: point.z + Math.cos(heading) * ahead }
}

/**
 * The quarter view that sends the walker's road up the screen — the one whose
 * camera they are walking away from, so the player sees their back and the way
 * ahead. Returns the view to hold, which is the one already in use until the
 * heading passes the turn by `margin`. Any fractional index left by a touch
 * twist settles on its nearest view.
 */
export function walkViewIndex(viewIndex: number, heading: number, margin: number = WALK_TURN_MARGIN): number {
  const view = Math.round(viewIndex)
  // Walking away from the camera means a heading half a turn from its yaw.
  const wanted = (heading - Math.PI - ISO_YAW_BASE) / (Math.PI / 2) - view
  const half = VIEW_COUNT / 2
  const turn = ((wanted % VIEW_COUNT) + VIEW_COUNT + half) % VIEW_COUNT - half
  return Math.abs(turn) < 0.5 + margin ? view : view + Math.round(turn)
}

/** Ease one heading towards another the short way round, as the walkers themselves turn. */
export function blendAngle(current: number, target: number, blend: number): number {
  const difference = target - current
  const turn = Math.atan2(Math.sin(difference), Math.cos(difference))
  return current + turn * Math.min(1, Math.max(0, blend))
}
