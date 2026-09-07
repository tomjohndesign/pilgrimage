import type { PersonDesign } from "./design"
import { woodcuttingProfile } from "./woodcutting"
import type { MonkActivity } from "../monks"
import type { Activity } from "../sim"
import { BASE_PERSON, PERSON_CLIPS, type BaseClip } from "./pose"

/** Visuals follow simulation state; freezing playback does not change the pose. */
export function activityClip(activity: Activity | MonkActivity | undefined, moving: boolean, carrying = 0): BaseClip {
  if (activity === "praying") return "praying"
  if (activity === "hoisting") return "hoisting"
  if (activity === "procession") return "procession"
  if (carrying > 0) return "carrying"
  if (moving) return "walk"
  switch (activity) {
    case "preaching": return "preaching"
    case "building": return "building"
    case "sleeping":
    case "camping": return "sleeping"
    case "idle":
    case "sitting":
      return "sitting"
    case "visiting": return "praying"
    // Resident monks rest on open ground, so use their existing kneeling pose.
    case "resting":
    case "vigil": return "praying"
    case "working": return "treeFelling"
    // This simulation state processes fallen timber; the gathering pose is reserved for harvesting.
    case "gathering": return "woodcutting"
    default: return "idle"
  }
}

/** Keep editor playback and in-game action timing on the same clock. */
export function actionPlaybackRate(clip: BaseClip, design?: Pick<PersonDesign, "bodyType" | "walkStyle">): number {
  if (clip === "woodcutting" || clip === "treeFelling") return woodcuttingProfile(design).playbackRate * PERSON_CLIPS[clip].frames / BASE_PERSON.defaultFps * (clip === "woodcutting" ? 0.5 : 1)
  if (clip === "preaching") return PERSON_CLIPS.preaching.frames / (4 * BASE_PERSON.defaultFps)
  if (clip === "building") return 0.75 * PERSON_CLIPS.building.frames / BASE_PERSON.defaultFps
  if (clip === "gathering") return (design?.walkStyle === "Devotional" ? 0.3 : 0.65) * PERSON_CLIPS[clip].frames / BASE_PERSON.defaultFps
  return 1
}
