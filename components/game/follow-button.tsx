"use client"

import { Crosshair, LocateFixed } from "lucide-react"
import { useCameraStore } from "@/lib/game/camera-store"

/**
 * The inspector's follow toggle, beside its dismiss button: keeps the camera
 * on the selected character, or on their whole party. Any pan releases it.
 * The crosshair gains its centre dot while locked on, as the music toggle
 * changes its icon by state.
 */
export function FollowButton({ subject }: { subject: string }) {
  const following = useCameraStore((s) => s.following)
  return (
    <button
      type="button"
      aria-label={following ? "Stop following" : `Follow ${subject}`}
      title={following ? "Stop following" : `Follow ${subject}`}
      aria-pressed={following}
      onClick={() => useCameraStore.getState().setFollowing(!following)}
      className="pointer-events-auto text-ink-light hover:text-ink aria-pressed:text-ink"
    >
      {following ? <LocateFixed size={12} aria-hidden="true" /> : <Crosshair size={12} aria-hidden="true" />}
    </button>
  )
}
