import type { PersonDesign } from "./design"
import { woodcuttingProfile } from "./woodcutting"
import type { MonkActivity } from "../monks"
import type { Activity } from "../sim"
import { PERSON_CLIPS, type BaseClip } from "./pose"

/** Visuals follow simulation state; freezing playback does not change the pose. */
export function activityClip(activity: Activity | MonkActivity | undefined, moving: boolean, carrying = 0): BaseClip {
  if (carrying > 0) return "carrying"
  if (moving) return "walk"
  switch (activity) {
    case "camping": return "sleeping"
    case "idle": return "sitting"
    // Resident monks rest on open ground, so use their existing kneeling pose.
    case "resting":
    case "vigil":
    case "visiting": return "praying"
    case "working": return "woodcutting"
    case "gathering": return "gathering"
    default: return "idle"
  }
}

/** Keep editor playback and in-game action timing on the same clock. */
export function actionPlaybackRate(clip: BaseClip, design?: Pick<PersonDesign, "bodyType" | "walkStyle">): number {
  if (clip === "woodcutting") return woodcuttingProfile(design).playbackRate * PERSON_CLIPS[clip].frames / 8
  if (clip === "gathering") return (design?.walkStyle === "Devotional" ? 0.3 : 0.65) * PERSON_CLIPS[clip].frames / 8
  return 1
}
