import { describe, expect, it } from "vitest"
import { activityClip } from "./activity"

describe("simulation sprite poses", () => {
  it("uses a weary walk while moving and retains rest and carrying poses", () => {
    expect(activityClip("seeking", true, 0, true)).toBe("wearyWalk")
    expect(activityClip("toCamp", true, 0, true)).toBe("wearyWalk")
    expect(activityClip("walking", true, 0, false)).toBe("walk")
    expect(activityClip("camping", false, 0, true)).toBe("sleeping")
    expect(activityClip("walking", false, 0, true)).toBe("idle")
    expect(activityClip("hauling", true, 5, true)).toBe("carrying")
  })
  it.each([
    ["preaching", "preaching"], ["praying", "praying"], ["hoisting", "hoisting"], ["procession", "procession"], ["vigil", "praying"], ["resting", "praying"], ["walking", "idle"], ["flying", "idle"],
    ["begging", "sitting"], ["givingAlms", "idle"], ["camping", "sleeping"], ["idle", "sitting"], ["visiting", "praying"],
    ["working", "treeFelling"], ["gathering", "woodcutting"], ["vending", "idle"],
  ] as const)("shows %s as %s", (activity, clip) => {
    expect(activityClip(activity, false)).toBe(clip)
  })
  it("keeps kneeling visitors praying when a procession passes, then walks away normally", () => {
    expect(activityClip("visiting", false, 0)).toBe("praying")
    expect(activityClip("praying", false, 0)).toBe("praying")
    expect(activityClip("fromRelic", true, 0)).toBe("walk")
  })
  it("walks between destinations and holds loads through stops", () => {
    for (const activity of ["toEvangelize", "toCamp", "toWork", "toRelic", "fromCamp", "fleeing"] as const) {
      expect(activityClip(activity, true)).toBe("walk")
    }
    expect(activityClip("praying", false, 5)).toBe("praying")
    expect(activityClip("procession", true)).toBe("procession")
    expect(activityClip("hauling", true, 5)).toBe("carrying")
    expect(activityClip("hauling", false, 5)).toBe("carrying")
    expect(activityClip("walking", true)).toBe("walk")
    expect(activityClip(undefined, false)).toBe("idle")
  })
})
