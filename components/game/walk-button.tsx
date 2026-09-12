"use client"

import { Footprints, Route } from "lucide-react"
import { useCameraStore } from "@/lib/game/camera-store"

/**
 * The inspector's walk toggle, beside the follow crosshair: the camera comes
 * down to the road with the selected person, holds them a little below centre,
 * and turns with every turn of their way so the road ahead runs up the screen.
 * Pressing it again — or Escape — gives back the view it borrowed; panning or
 * turning by hand keeps the framing the player chose, as any pan ends a follow.
 * The footprints become a road while the walk is on, as the crosshair gains its
 * centre dot when the camera locks on.
 */
export function WalkButton({ subject }: { subject: string }) {
  const walking = useCameraStore((s) => s.walkWith)
  return (
    <button
      type="button"
      aria-label={walking ? "Stop walking along" : `Walk with ${subject}`}
      title={walking ? "Stop walking along" : `Walk with ${subject}`}
      aria-pressed={walking}
      onClick={() => useCameraStore.getState().setWalkWith(!walking)}
      className="pointer-events-auto text-ink-light hover:text-ink aria-pressed:text-ink"
    >
      {walking ? <Route size={12} aria-hidden="true" /> : <Footprints size={12} aria-hidden="true" />}
    </button>
  )
}
