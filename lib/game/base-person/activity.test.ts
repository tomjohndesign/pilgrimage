import { describe, expect, it } from "vitest"
import { activityClip } from "./activity"

describe("simulation sprite poses", () => {
  it.each([
    ["vigil", "praying"], ["resting", "sitting"], ["walking", "idle"], ["flying", "idle"],
    ["camping", "sleeping"], ["idle", "sitting"], ["visiting", "praying"],
    ["working", "woodcutting"], ["gathering", "gathering"], ["vending", "idle"],
  ] as const)("shows %s as %s", (activity, clip) => {
    expect(activityClip(activity, false)).toBe(clip)
  })
  it("walks between destinations and holds loads through stops", () => {
    for (const activity of ["toCamp", "toWork", "toRelic", "fromCamp", "fleeing"] as const) {
      expect(activityClip(activity, true)).toBe("walk")
    }
    expect(activityClip("hauling", true, 5)).toBe("carrying")
    expect(activityClip("hauling", false, 5)).toBe("carrying")
    expect(activityClip("walking", true)).toBe("walk")
    expect(activityClip(undefined, false)).toBe("idle")
  })
})
