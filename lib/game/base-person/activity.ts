import type { MonkActivity } from "../monks"
import type { Activity } from "../sim"
import type { BaseClip } from "./pose"

/** Visuals follow simulation state; freezing playback does not change the pose. */
export function activityClip(activity: Activity | MonkActivity | undefined, moving: boolean, carrying = 0): BaseClip {
  if (carrying > 0) return "carrying"
  if (moving) return "walk"
  switch (activity) {
    case "camping": return "sleeping"
    case "resting":
    case "idle": return "sitting"
    case "vigil":
    case "visiting": return "praying"
    case "working": return "woodcutting"
    case "gathering": return "gathering"
    default: return "idle"
  }
}
