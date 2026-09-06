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
    case "resting":
    case "idle": return "sitting"
    case "vigil":
    case "visiting": return "praying"
    case "working": return "treeFelling"
    // This simulation state processes fallen timber; the gathering pose is reserved for harvesting.
    case "gathering": return "woodcutting"
    default: return "idle"
  }
}

/** Keep editor playback and in-game action timing on the same clock. */
export function actionPlaybackRate(clip: BaseClip, design?: Pick<PersonDesign, "bodyType" | "walkStyle">): number {
  if (clip === "woodcutting" || clip === "treeFelling") return woodcuttingProfile(design).playbackRate * PERSON_CLIPS[clip].frames / 8 * (clip === "woodcutting" ? 0.5 : 1)
  if (clip === "gathering") return (design?.walkStyle === "Devotional" ? 0.3 : 0.65) * PERSON_CLIPS[clip].frames / 8
  return 1
}
